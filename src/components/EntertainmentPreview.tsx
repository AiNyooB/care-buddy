import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { listen, emit } from '@tauri-apps/api/event';
import { Check, Clock3, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { TaskIcon } from './Icons';
import { BorderBeam } from './ui/border-beam';
import { Button } from '@/components/ui/button';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import {
  snoozeEntertainment,
  startEntertainmentDrag,
  startEntertainmentResize,
  saveEntertainmentPosition,
  getEntertainmentPosition,
  getEntertainmentState,
  getCurrentTriggeredTask,
  onCountdownUpdate,
} from '../services';
import { toast } from 'sonner';

interface TriggeredPayload {
  taskId: string;
  title: string;
  desc: string;
  icon: string;
  mergedIds?: string[];
}

type EntertainmentPhase = 'idle' | 'triggered';

function useEntranceAnimation() {
  const [scale, setScale] = useState(0.85);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 500;
    let raf: number;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setScale(0.85 + (1 - 0.85) * Math.min(1, t * 2.5));
      setOpacity(Math.min(1, t * 4));
      if (t < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { scale, opacity };
}

// 方案 A：窗口=胶囊，宽度由 Rust 弹簧驱动。这两个值须与 Rust 常量一致：
// ENTERTAINMENT_PREVIEW_WIDTH(120) / FLOATING_DEFAULT_WIDTH(278)。改宽度须两边同步。
const CAPSULE_IDLE_WIDTH = 120;
const CAPSULE_TRIGGERED_WIDTH = 278;

export function EntertainmentPreview() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<EntertainmentPhase>('idle');
  const [triggeredTask, setTriggeredTask] = useState<TriggeredPayload | null>(null);
  const [entertainmentOpacity, setEntertainmentOpacity] = useState(70);
  const [entertainmentSnoozeMinutes, setEntertainmentSnoozeMinutes] = useState(10);
  const [dismissing, setDismissing] = useState(false);

  // 娱乐窗口是独立 webview，未挂载 <App/>，store 里没有倒计时数据。
  // 因此自行订阅后端全局广播的 countdown-update，用本地 state 驱动 idle 态显示。
  const [entertainmentCountdown, setEntertainmentCountdown] = useState<{
    remaining: number;
    total: number;
  } | null>(null);

  const phaseRef = useRef(phase);
  const dismissingRef = useRef(dismissing);
  const triggeredTaskRef = useRef(triggeredTask);
  const autoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { dismissingRef.current = dismissing; }, [dismissing]);
  useEffect(() => { triggeredTaskRef.current = triggeredTask; }, [triggeredTask]);

  const { scale, opacity } = useEntranceAnimation();

  // 娱乐胶囊窗口：与浮窗一致，挂载即强制 html/body 透明 + 修复 h-full 高度链
  useEffect(() => {
    document.documentElement.classList.add('floating-mode');
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    document.body.style.background = 'transparent';

    return () => {
      document.documentElement.classList.remove('floating-mode');
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
      document.body.style.background = '';
    };
  }, []);

  // 挂载时恢复共享胶囊锚点位置（与浮窗同锚点，避免切换到娱乐胶囊时位置跳变）
  useEffect(() => {
    getEntertainmentPosition().then((pos) => {
      if (pos) {
        getCurrentWebviewWindow().setPosition(new PhysicalPosition(pos.x, pos.y)).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  // 挂载时拉取配置 + 当前未处理的 triggered 任务
  useEffect(() => {
    getEntertainmentState()
      .then((state) => {
        setEntertainmentOpacity(state.opacity);
        setEntertainmentSnoozeMinutes(state.snoozeMinutes);
      })
      .catch(console.warn);

    getCurrentTriggeredTask()
      .then((payload) => {
        if (!payload) return;
        // FE-1.7 修复：getCurrentTriggeredTask 已强类型化，无需双重断言。
        // 本地 TriggeredPayload 与 TriggeredTaskPayload 结构一致。
        setTriggeredTask(payload);
        startEntertainmentResize(CAPSULE_TRIGGERED_WIDTH).catch(console.warn);
        phaseRef.current = 'triggered';
        setPhase('triggered');
      })
      .catch(console.warn);
  }, []);

  // 监听 entertainment-task-triggered + entertainment-task-cleared 事件
  useEffect(() => {
    let cleanupTriggered: (() => void) | null = null;
    let cleanupCleared: (() => void) | null = null;
    let cleanupIdle: (() => void) | null = null;

    listen<TriggeredPayload>('entertainment-task-triggered', (event) => {
      // FE-1.2 修复：dismiss 进行中收到新 triggered 事件直接丢弃，避免覆盖正在 dismiss 的任务。
      // 娱乐每次只发一条固定「健康休息」payload，丢弃后下一 reminder_seconds 周期会重新 emit。
      // Rust-S1 修复后已不再每秒重复 emit，此守卫作为防御性兜底。
      if (dismissingRef.current) {
        return;
      }
      const task = event.payload;
      if (phaseRef.current === 'triggered') {
        // 已有触发任务，覆盖为最新一次（娱乐每次只发一条固定「健康休息」，此处防御性处理）
        setTriggeredTask(task);
      } else {
        setTriggeredTask(task);
        startEntertainmentResize(CAPSULE_TRIGGERED_WIDTH).catch(console.warn);
        phaseRef.current = 'triggered';
        setPhase('triggered');
      }
    }).then((f) => { cleanupTriggered = f; });

    // 监听清除事件：托盘重置 / 空闲 / 模式禁用时清空触发态
    listen<{ clearAll?: boolean; taskId?: string }>('entertainment-task-cleared', (event) => {
      if (event.payload.clearAll || !event.payload.taskId) {
        // 全清
        if (autoTimeoutRef.current) {
          clearTimeout(autoTimeoutRef.current);
          autoTimeoutRef.current = null;
        }
        setTriggeredTask(null);
        startEntertainmentResize(CAPSULE_IDLE_WIDTH).catch(console.warn);
        phaseRef.current = 'idle';
        setPhase('idle');
      } else {
        // 单任务清除：若当前显示的 triggered 任务包含该 ID，则清除
        const current = triggeredTaskRef.current;
        if (current?.mergedIds?.includes(event.payload.taskId) ||
            current?.taskId === event.payload.taskId) {
          if (autoTimeoutRef.current) {
            clearTimeout(autoTimeoutRef.current);
            autoTimeoutRef.current = null;
          }
          setTriggeredTask(null);
          startEntertainmentResize(CAPSULE_IDLE_WIDTH).catch(console.warn);
          phaseRef.current = 'idle';
          setPhase('idle');
        }
      }
    }).then((f) => { cleanupCleared = f; });

    // FE-1.5 修复：监听 idle-status-changed，与 FloatingPreview L262-284 对称。
    // 后端虽会主动 emit entertainment-task-cleared，但前端缺少 idle 兜底重置时
    // IPC 乱序仍可能锁死 phase（如 cleared 事件先于 idle-status-changed 到达但被消费后
    // 又收到 stale triggered 事件）。idle 进入时清 phase + triggeredTask + 超时计时器，
    // idle 退出时若仍卡在 triggered 态则强制归位 idle（娱乐无 preview 态，归位 idle 即可）。
    listen<{ is_idle: boolean }>('idle-status-changed', (event) => {
      if (event.payload.is_idle) {
        if (autoTimeoutRef.current) {
          clearTimeout(autoTimeoutRef.current);
          autoTimeoutRef.current = null;
        }
        setTriggeredTask(null);
        startEntertainmentResize(CAPSULE_IDLE_WIDTH).catch(console.warn);
        phaseRef.current = 'idle';
        setPhase('idle');
      } else {
        // 退出空闲：若仍卡在 triggered 态（理论上不应发生，但 IPC 乱序时可能）则归位 idle
        if (phaseRef.current === 'triggered') {
          setTriggeredTask(null);
          startEntertainmentResize(CAPSULE_IDLE_WIDTH).catch(console.warn);
          phaseRef.current = 'idle';
          setPhase('idle');
        }
      }
    }).then((f) => { cleanupIdle = f; });

    return () => {
      cleanupTriggered?.();
      cleanupCleared?.();
      cleanupIdle?.();
    };
  }, []);

  // 订阅统一倒计时广播（idle 态显示剩余时间，替代永远为 null 的 store 字段）
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onCountdownUpdate((_countdowns, entertainment) => {
      setEntertainmentCountdown(entertainment);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // 监听娱乐模式退出事件：归位到 idle（重激活前清空残留的 triggered 态）
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ active: boolean }>('entertainment-mode-changed', (event) => {
      if (event.payload.active) return;
      if (autoTimeoutRef.current) {
        clearTimeout(autoTimeoutRef.current);
        autoTimeoutRef.current = null;
      }
      setTriggeredTask(null);
      startEntertainmentResize(CAPSULE_IDLE_WIDTH).catch(console.warn);
      phaseRef.current = 'idle';
      setPhase('idle');
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // 监听娱乐窗口设置实时更新（用户从设置页滑动滑块后生效）
  useEffect(() => {
    let unlistenOpacity: (() => void) | undefined;
    let unlistenSnooze: (() => void) | undefined;

    listen<number>('entertainment-opacity-changed', (event) => {
      setEntertainmentOpacity(event.payload);
    }).then((fn) => { unlistenOpacity = fn; });

    listen<number>('entertainment-snooze-changed', (event) => {
      setEntertainmentSnoozeMinutes(event.payload);
    }).then((fn) => { unlistenSnooze = fn; });

    return () => {
      unlistenOpacity?.();
      unlistenSnooze?.();
    };
  }, []);

  // 触发态超时自动推迟
  useEffect(() => {
    if (phase !== 'triggered' || !triggeredTask) return;
    if (entertainmentSnoozeMinutes <= 0) return;
    autoTimeoutRef.current = setTimeout(() => {
      handleSnooze();
    }, entertainmentSnoozeMinutes * 60 * 1000);
    return () => {
      if (autoTimeoutRef.current) {
        clearTimeout(autoTimeoutRef.current);
        autoTimeoutRef.current = null;
      }
    };
  }, [phase, triggeredTask, entertainmentSnoozeMinutes]);

  const dismissTriggered = async (action: () => Promise<void>, actionType: 'done' | 'snooze') => {
    // FE-1.3 修复：守卫改用 ref（同步读取），避免 setState 异步导致双击在 re-render 前绕过守卫。
    // setState 仍保留用于 UI 反馈（按钮 disabled 态）。
    if (!triggeredTask || dismissingRef.current) return;
    const taskId = triggeredTask.taskId;
    // FE-1.6 修复：allIds 须包含主 taskId（与 FloatingPreview 对齐）。
    // 注：娱乐 payload 的 taskId 是虚拟 ID "entertainment-unified"，mergedIds 是真实任务 ID。
    // 主窗口的 useEntertainmentManager 会按 allIds 调 resetTask + recordTaskCompletion。
    const allIds = [taskId, ...(triggeredTask.mergedIds ?? [])];
    dismissingRef.current = true;
    setDismissing(true);
    if (autoTimeoutRef.current) {
      clearTimeout(autoTimeoutRef.current);
      autoTimeoutRef.current = null;
    }
    try {
      await action();
      setPhase('idle');
      startEntertainmentResize(CAPSULE_IDLE_WIDTH).catch(console.warn);
      setTriggeredTask(null);
      // FE-1.9 修复：emit 真实 taskId（原为空串），下游监听方可拿到主任务 ID。
      await emit('entertainment-task-dismissed', {
        taskId,
        mergedIds: allIds,
        action: actionType,
      });
    } catch (e) {
      dismissingRef.current = false;
      setDismissing(false);
      return;
    } finally {
      dismissingRef.current = false;
      setDismissing(false);
    }
  };

  // FE-1.1 修复：handleDone 不再在娱乐窗口直接调 recordTaskCompletion/resetTask。
  // 娱乐窗口是独立 webview，写入的 localStorage 与主窗口隔离 → 统计丢失。
  // 改为只 emit dismissed 事件，由主窗口的 useEntertainmentManager 在主窗口 localStorage
  // 内完成 resetTask + recordTaskCompletion（与 FloatingPreview/useFloatingManager 架构对齐）。
  const handleDone = () => dismissTriggered(async () => {
    // 实际 reset + stats 由主窗口 useEntertainmentManager 处理
  }, 'done');

  const handleSnooze = () => dismissTriggered(async () => {
    // 调用专门 IPC 设置 snoozed_until，倒计时按 snooze_minutes 递减
    // 不再对 sit/water/eye 调 timerSnoozeTask：娱乐模式是独立提醒节奏（维度 B），
    // 与具体任务 interval（维度 A）无关，原代码错误地把两个维度耦合
    try {
      await snoozeEntertainment(entertainmentSnoozeMinutes);
    } catch (e) {
      console.warn('[EntertainmentPreview handleSnooze] IPC failed:', e);
      toast.error(t('floating.snoozeFailed', { defaultValue: '推迟失败，请重试' }));
      throw e;
    }
  }, 'snooze');

  // 透明度应用娱乐配置
  const finalOpacity = (entertainmentOpacity / 100) * opacity;

  // 拖拽支持
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, a, [role="button"]')) return;
      if (!target.closest('[data-draggable]')) return;
      e.stopImmediatePropagation();
      startEntertainmentDrag().catch(console.warn);

      const onPointerUp = () => {
        getCurrentWebviewWindow().position().then((pos) => {
          saveEntertainmentPosition(pos.x, pos.y).catch(() => {});
        }).catch(() => {});
      };
      window.addEventListener('pointerup', onPointerUp, { once: true });
    };

    document.addEventListener('mousedown', handler, { capture: true });
    return () => document.removeEventListener('mousedown', handler, { capture: true });
  }, []);

  return (
    <div
      className="relative h-full w-full"
      data-entertainment-capsule
    >
      <div
        className="h-full w-full"
        style={{
          opacity: finalOpacity,
          transform: `scale(${scale})`,
        }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-full bg-black [contain:strict]"
          data-draggable
          style={{
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
          }}>
          {phase === 'triggered' && (
            <BorderBeam
              size={120}
              duration={8}
              className="from-transparent via-blue-500 to-transparent"
            />
          )}
          <div className="absolute inset-0 z-1 flex items-center justify-center gap-2 px-2 py-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={phase === 'triggered' ? 'triggered' : 'idle'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex w-full items-center gap-3"
              >
                {/* 图标 */}
                {phase === 'triggered' && triggeredTask ? (
                  <div className="flex size-[32px] shrink-0 items-center justify-center text-white">
                    <TaskIcon icon={triggeredTask.icon} size={15} />
                  </div>
                ) : (
                  <div className="flex size-[16px] shrink-0 items-center justify-center text-white/80">
                    <Play size={13} className="fill-current" />
                  </div>
                )}

                {/* 标题 / 倒计时 */}
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                  {phase === 'triggered' && triggeredTask ? (
                    <span className="truncate text-sm font-medium leading-tight text-white/90">
                      {t('settings.entertainmentCapsulePrefix')}{t(`tasks.${triggeredTask.taskId}.title`, { defaultValue: triggeredTask.title })}
                    </span>
                  ) : (
                    <div className="flex min-w-0 flex-col justify-center leading-none">
                      <span className="text-[10px] font-medium text-white/55">{t('settings.entertainmentCapsuleIdle')}</span>
                      <span className="text-sm font-semibold text-white/90 tabular-nums">
                        {entertainmentCountdown
                          ? `${String(Math.floor(entertainmentCountdown.remaining / 60)).padStart(2, '0')}:${String(entertainmentCountdown.remaining % 60).padStart(2, '0')}`
                          : '--:--'}
                      </span>
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                {phase === 'triggered' && triggeredTask && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="default"
                      className="justify-center gap-1 pointer-events-auto rounded-2xl bg-white/10 text-white hover:bg-white/20"
                      onClick={handleSnooze}
                      disabled={dismissing}
                    >
                      <Clock3 size={14} />
                      {entertainmentSnoozeMinutes}{t('time.minutes')}
                    </Button>
                    <Button
                      size="default"
                      className="justify-center gap-1 pointer-events-auto rounded-2xl bg-white text-neutral-900 hover:bg-white/90"
                      onClick={handleDone}
                      disabled={dismissing}
                    >
                      <Check size={12} />
                      {t('settings.entertainmentDone')}
                    </Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
