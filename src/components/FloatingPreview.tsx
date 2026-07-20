import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { listen, emit } from '@tauri-apps/api/event';
import { Check, Clock, Clock3 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { TaskIcon } from './Icons';
import { CircularProgress } from './CircularProgress';
import { BorderBeam } from './ui/border-beam';
import { Button } from '@/components/ui/button';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { useHealthStore } from '@/store';
import {
  timerSnoozeTask,
  timerReopenTriggered,
  startFloatingDrag,
  startFloatingResize,
  saveFloatingPosition,
  getFloatingPosition,
} from '../services';
import { toast } from 'sonner';
import type { AppMode } from '../types';
import type { AppModePayload } from '../services';

interface PreviewPayload {
  taskId: string;
  title: string;
  desc: string;
  icon: string;
  remaining: number;
  interval: number;
  preNotificationSeconds: number;
  otherCount: number;
}

interface TriggeredPayload {
  taskId: string;
  title: string;
  desc: string;
  icon: string;
  mergedIds?: string[];      // 合并的其他任务 ID
}

type FloatingPhase = 'idle' | 'preview' | 'triggered';

function useSpringValue(target: number, config?: { tension?: number; damping?: number }) {
  const { tension = 0.08, damping = 0.6 } = config ?? {};
  const val = useRef(target);
  const vel = useRef(0);
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    let raf: number;
    const step = () => {
      const dx = target - val.current;
      vel.current += dx * tension;
      vel.current *= damping;
      val.current += vel.current;
      setDisplay(Math.round(val.current * 100) / 100);
      if (Math.abs(dx) > 0.01 || Math.abs(vel.current) > 0.01) {
        raf = requestAnimationFrame(step);
      } else {
        setDisplay(target);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, tension, damping]);

  return display;
}

function useEntranceAnimation() {
  const [scale, setScale] = useState(0.85);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 350;
    const freq = 3.2;
    const decay = 18.0;
    let raf: number;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const s = 1 - Math.cos(2 * Math.PI * freq * t) * Math.exp(-decay * t);
      setScale(0.85 + (1 - 0.85) * Math.min(1, t * 2.5));
      setOpacity(Math.min(1, t * 4));
      if (t < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { scale, opacity };
}

export function FloatingPreview() {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [phase, setPhase] = useState<FloatingPhase>('idle');
  const [triggeredTask, setTriggeredTask] = useState<TriggeredPayload | null>(null);
  const [mode, setMode] = useState<AppMode>('notification');
  const [floatingOpacity, setFloatingOpacity] = useState(55);
  const [floatingSnoozeMinutes, setFloatingSnoozeMinutes] = useState(5);
  const [dismissing, setDismissing] = useState(false);

  // 方案 A：窗口=胶囊，宽度由 Rust 弹簧驱动。这两个值须与 Rust 常量一致：
  // FLOATING_PREVIEW_WIDTH(156) / FLOATING_DEFAULT_WIDTH(278)。改宽度须两边同步。
  const CAPSULE_PREVIEW_WIDTH = 156;
  const CAPSULE_TRIGGERED_WIDTH = 278;

  // 用 ref 保存最新状态，供事件监听使用，避免重复订阅
  const phaseRef = useRef(phase);
  const dismissingRef = useRef(dismissing);
  const triggeredQueue = useRef<TriggeredPayload[]>([]);
  const autoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { dismissingRef.current = dismissing; }, [dismissing]);

  const { scale, opacity } = useEntranceAnimation();
  const springRemaining = useSpringValue(preview?.remaining ?? 0);

  // 挂载时查询后端当前浮窗状态，避免启动时错过 app-mode-changed 事件
  useEffect(() => {
    invoke<{ mode: string; opacity: number; snoozeMinutes: number }>('get_floating_state')
      .then((state) => {
        setMode(state.mode as AppMode);
        setFloatingOpacity(state.opacity);
        setFloatingSnoozeMinutes(state.snoozeMinutes);
      })
      .catch(console.warn);

    // 事件丢失自愈：浮窗首次创建(或重订阅)时若已错过 floating-task-triggered 事件，
    // 请求后端对仍处于 triggered 的任务重发。娱乐窗已有 getCurrentTriggeredTask 兜底，
    // 浮窗此前缺失此补救，导致一次性事件飞走后永久停 preview（真 bug）。
    timerReopenTriggered().catch(console.warn);
  }, []);

  // 挂载时恢复保存的浮窗位置（已由 Rust ensure_capsule_window 创建时设定，前端不再覆盖）

  // 浮窗模式下设置 html/body 透明背景（已由 CapsuleShell 管理，此组件保留占位）

  useEffect(() => {
    let cleanupPreview: (() => void) | null = null;
    let cleanupTriggered: (() => void) | null = null;
    let cleanupMode: (() => void) | null = null;
    let cleanupResetAll: (() => void) | null = null;
    let cleanupTaskCleared: (() => void) | null = null;
    let cleanupIdle: (() => void) | null = null;

    listen<PreviewPayload>('floating-preview-update', (event) => {
      // 已进入触发态时不接受 preview 更新，避免覆写 triggered 内容
      if (phaseRef.current === 'triggered' || dismissingRef.current) {
        return;
      }
      setPreview(event.payload);
      phaseRef.current = 'preview';
      setPhase('preview');
    }).then((f) => { cleanupPreview = f; });

    listen<TriggeredPayload>('floating-task-triggered', (event) => {
      if (useHealthStore.getState().isIdle) {
        return;
      }
      if (phaseRef.current === 'triggered') {
        triggeredQueue.current.push(event.payload);
        return;
      }
      setTriggeredTask(event.payload);
      startFloatingResize(CAPSULE_TRIGGERED_WIDTH).catch(console.warn);
      setDismissing(false);
      dismissingRef.current = false;
      phaseRef.current = 'triggered';
      setPhase('triggered');
    }).then((f) => { cleanupTriggered = f; });

    listen<AppModePayload>('app-mode-changed', (event) => {
      setMode(event.payload.mode);
      setFloatingOpacity(event.payload.opacity);
      setFloatingSnoozeMinutes(event.payload.snoozeMinutes);
      // 切到非浮窗模式时，清除触发态 React 状态（防止窗口被重新 show 后胶囊又出现）
      if (event.payload.mode !== 'floating') {
        triggeredQueue.current = [];
        if (autoTimeoutRef.current) {
          clearTimeout(autoTimeoutRef.current);
          autoTimeoutRef.current = null;
        }
        setTriggeredTask(null);
        startFloatingResize(CAPSULE_PREVIEW_WIDTH).catch(console.warn);
        phaseRef.current = 'preview';
        setPhase('preview');
      }
    }).then((f) => { cleanupMode = f; });

    listen('floating-reset-all', () => {
      triggeredQueue.current = [];
      if (autoTimeoutRef.current) {
        clearTimeout(autoTimeoutRef.current);
        autoTimeoutRef.current = null;
      }
      setTriggeredTask(null);
      startFloatingResize(CAPSULE_PREVIEW_WIDTH).catch(console.warn);
      phaseRef.current = 'preview';
      setPhase('preview');
    }).then((f) => { cleanupResetAll = f; });

    listen<{ taskId: string }>('floating-task-cleared', (event) => {
      const clearedId = event.payload.taskId;
      triggeredQueue.current = triggeredQueue.current.filter((t) => t.taskId !== clearedId);
      if (phaseRef.current === 'triggered' && triggeredTask?.taskId === clearedId) {
        if (autoTimeoutRef.current) {
          clearTimeout(autoTimeoutRef.current);
          autoTimeoutRef.current = null;
        }
        setTriggeredTask(null);
        startFloatingResize(CAPSULE_PREVIEW_WIDTH).catch(console.warn);
        phaseRef.current = 'preview';
        setPhase('preview');
      }
    }).then((f) => { cleanupTaskCleared = f; });

    listen<{ is_idle: boolean }>('idle-status-changed', (event) => {
      if (event.payload.is_idle) {
        triggeredQueue.current = [];
        if (autoTimeoutRef.current) {
          clearTimeout(autoTimeoutRef.current);
          autoTimeoutRef.current = null;
        }
        setTriggeredTask(null);
        startFloatingResize(CAPSULE_PREVIEW_WIDTH).catch(console.warn);
        phaseRef.current = 'preview';
        setPhase('preview');
      } else {
        if (phaseRef.current === 'triggered') {
          setTriggeredTask(null);
          startFloatingResize(CAPSULE_PREVIEW_WIDTH).catch(console.warn);
          phaseRef.current = 'preview';
          setPhase('preview');
        }
      }
    }).then((f) => { cleanupIdle = f; });

    return () => {
      cleanupPreview?.();
      cleanupTriggered?.();
      cleanupMode?.();
      cleanupResetAll?.();
      cleanupTaskCleared?.();
      cleanupIdle?.();
    };
  }, []);

  // 触发态超时自动推迟：超过推迟时间无操作，自动 Snooze（不累加统计）
  useEffect(() => {
    if (phase !== 'triggered' || !triggeredTask) return;
    // 推迟时间为 0 时不设超时，保持触发态直到用户操作
    if (floatingSnoozeMinutes <= 0) return;
    autoTimeoutRef.current = setTimeout(() => {
      handleSnooze();
    }, floatingSnoozeMinutes * 60 * 1000);
    return () => {
      if (autoTimeoutRef.current) {
        clearTimeout(autoTimeoutRef.current);
        autoTimeoutRef.current = null;
      }
    };
  }, [phase, triggeredTask, floatingSnoozeMinutes]);

  const dismissTriggered = async (action: () => Promise<void>, actionType: 'done' | 'snooze') => {
    if (!triggeredTask || dismissing) return;
    const taskId = triggeredTask.taskId;
    const allIds = [taskId, ...(triggeredTask.mergedIds ?? [])];
    setDismissing(true);
    // 清除超时计时器
    if (autoTimeoutRef.current) {
      clearTimeout(autoTimeoutRef.current);
      autoTimeoutRef.current = null;
    }
    try {
      await action();
      // action 成功后再清理 UI 状态，失败时保留 triggered 态供用户重试
      setPhase('preview');
      startFloatingResize(CAPSULE_PREVIEW_WIDTH).catch(console.warn);
      setTriggeredTask(null);
      await emit('floating-task-dismissed', {
        taskId,
        mergedIds: allIds,
        action: actionType,
      });
    } catch (e) {
      // action 失败：恢复 dismissing 状态，保留 triggered 态
      setDismissing(false);
      return;
    } finally {
      setDismissing(false);
      // 检查队列：显示下一个触发的任务
      if (triggeredQueue.current.length > 0) {
        const next = triggeredQueue.current.shift()!;
        setTriggeredTask(next);
        startFloatingResize(CAPSULE_TRIGGERED_WIDTH).catch(console.warn);
        phaseRef.current = 'triggered';
        setPhase('triggered');
      }
    }
  };

  const handleDone = () => dismissTriggered(async () => {
    const taskIds = [triggeredTask!.taskId, ...(triggeredTask!.mergedIds ?? [])];
    await Promise.all(taskIds.map(id => useHealthStore.getState().resetTask(id)));
  }, 'done');
  const handleSnooze = () => dismissTriggered(async () => {
    const taskIds = [triggeredTask!.taskId, ...(triggeredTask!.mergedIds ?? [])];
    try {
      await Promise.all(taskIds.map(id => timerSnoozeTask(id, floatingSnoozeMinutes)));
    } catch (e) {
      console.warn('[handleSnooze] IPC failed:', e);
      toast.error(t('floating.snoozeFailed', { defaultValue: '推迟失败，请重试' }));
      throw e; // re-throw 阻止 dismissTriggered emit dismissed（避免浮窗闪烁）
    }
  }, 'snooze');

  const hasData = preview !== null;
  const totalSecs = preview ? Math.max(preview.interval * 60, 1) : 1;
  const springPct = preview
    ? Math.max(0, Math.min(1, springRemaining / totalSecs))
    : 0;

  // 浮窗模式下按配置透明度缩放，其它模式使用入场动画透明度
  const finalOpacity = mode === 'floating'
    ? (floatingOpacity / 100) * opacity
    : opacity;

  const isDraggable = mode === 'floating';

  useEffect(() => {
    if (!isDraggable) return;

    const handler = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, a, [role="button"]')) return;
      if (!target.closest('[data-draggable]')) return;
      e.stopImmediatePropagation();
      startFloatingDrag().catch(console.warn);

      // 拖拽结束后保存位置
      const onPointerUp = () => {
        getCurrentWebviewWindow().position().then((pos) => {
          saveFloatingPosition(pos.x, pos.y).catch(() => {});
        }).catch(() => {});
      };
      window.addEventListener('pointerup', onPointerUp, { once: true });
    };

    document.addEventListener('mousedown', handler, { capture: true });
    return () => document.removeEventListener('mousedown', handler, { capture: true });
  }, [isDraggable]);

  return (
    <div
      className="relative h-full w-full"
      data-floating-capsule
    >
      <div
        className="h-full w-full"
        style={{
          opacity: finalOpacity,
          transform: `scale(${scale})`,
        }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-full bg-black/80 [contain:layout]"
          data-draggable
          style={{
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
          }}>
          {phase === 'triggered' && (
            <BorderBeam
              size={80}
              duration={6}
              borderWidth={1.5}
              className="from-transparent via-blue-500 to-transparent"
            />
          )}
          <div className="absolute inset-0 z-1 flex items-center justify-center gap-2 px-2 py-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={phase === 'triggered' ? 'triggered' : 'preview'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex w-full items-center gap-3"
              >
                {/* 环形进度图标 */}
                {hasData || (phase === 'triggered' && triggeredTask) ? (
                  <div className="relative shrink-0" style={{ width: 32, height: 32 }}>
                    <CircularProgress
                      size={32}
                      strokeWidth={3}
                      progress={phase === 'triggered' ? 0 : springPct}
                      color="rgba(255,255,255,0.7)"
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-white">
                      <TaskIcon icon={phase === 'triggered' && triggeredTask ? triggeredTask.icon : preview!.icon} size={15} />
                    </div>
                  </div>
                ) : (
                  <div className="flex size-[32px] shrink-0 items-center justify-center">
                    <Clock size={17} className="text-white/50" />
                  </div>
                )}

                {/* 中：标题 */}
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                  <span className="truncate text-sm font-medium leading-tight text-white/90">
                    {phase === 'triggered' && triggeredTask
                      ? t(`tasks.${triggeredTask.taskId}.title`, { defaultValue: triggeredTask.title })
                      : hasData
                        ? t(`tasks.${preview!.taskId}.title`, { defaultValue: preview!.title })
                        : t('floating.noReminder', { defaultValue: '暂无提醒' })}
                  </span>
                </div>

                {/* 右：操作按钮 */}
                {phase === 'triggered' && triggeredTask && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="default"
                      className="justify-center gap-1 pointer-events-auto rounded-2xl bg-white/10 text-white hover:bg-white/20"
                      onClick={handleSnooze}
                      disabled={dismissing}
                    >
                      <Clock3 size={14} />
                      {floatingSnoozeMinutes}{t('time.minutes')}
                    </Button>
                    <Button
                      size="default"
                      className="justify-center gap-1 pointer-events-auto rounded-2xl bg-white text-neutral-900 hover:bg-white/90"
                      onClick={handleDone}
                      disabled={dismissing}
                    >
                      <Check size={12} />
                      {t('floating.done')}
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
