/**
 * 健康提醒应用 - React + TypeScript 主组件
 */

import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  Sidebar,
  TimerCards,
  TodayStats,
  Settings,
  ExercisePanel,
  ExerciseLibrary,
  StatsDashboard,
  WindowControls,
} from './components';
import type { ViewMode } from './components/Sidebar';
import { useHealthStore } from './store';
import { getTodayDate } from './utils/time';
import { Toaster } from '@/components/ui/sonner';
import {
  onCountdownUpdate,
  onLockScreenOpen,
  onIdleStatusChanged,
  onPauseStateUpdate,
  onSettingsUpdate,
  syncTasks,
  isTimerPaused,
  wasStartedSilent,
  hideWindow,
  enterLockMode,
  timerSetLockScreenActive,
  playNotificationSound,
  pauseTimer,
  resumeTimer,
  timerResetAll,
  timerResetTask,
  showFloatingWindow,
  showNotification,
  hideFloatingWindow,
  getCountdowns,
  listen,
  timerSetSystemLocked,
  updatePauseMenu,
  emitPauseStateUpdated,
} from './services';

function App() {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [restoreCount, setRestoreCount] = useState(0);

  const tasks = useHealthStore((s) => s.tasks);
  const settings = useHealthStore((s) => s.settings);
  const updateCountdowns = useHealthStore((s) => s.updateCountdowns);
  const lockScreen = useHealthStore((s) => s.lockScreen);
  const exercisePanel = useHealthStore((s) => s.exercisePanel);
  const setPaused = useHealthStore((s) => s.setPaused);
  const setIdle = useHealthStore((s) => s.setIdle);
  const resetAllTasks = useHealthStore((s) => s.resetAllTasks);
  const closeLockScreen = useHealthStore((s) => s.closeLockScreen);
  const openLockScreen = useHealthStore((s) => s.openLockScreen);
  const updateSettings = useHealthStore((s) => s.updateSettings);

  const notifiedPre = useRef(new Set<string>());
  const floatingVisible = useRef(false);
  const lockScreenCreating = useRef(false);

  const handleThemeToggle = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(settings.theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    updateSettings({ theme: nextTheme });

    document.documentElement.setAttribute('data-theme', nextTheme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : nextTheme
    );
  };

  // 初始化：验证日期 + 同步任务到后端 + 加载初始状态
  useEffect(() => {
    // 验证 todayStats 日期，跨天时保存旧数据并重置
    const s = useHealthStore.getState();
    const today = getTodayDate();
    if (s.todayStats.date !== '' && s.todayStats.date !== today) {
      s.updateDailyStats(s.todayStats.date);
    }

    const init = async () => {
      // 同步任务到后端
      await syncTasks(tasks).catch(console.warn);

      // 检查定时器状态
      const paused = await isTimerPaused().catch(() => false);
      setPaused(paused);

      // 检查是否静默启动（隐藏主窗口）
      const silent = await wasStartedSilent().catch(() => false);
      if (silent) {
        await hideWindow().catch(console.warn);
      }
    };

    init().catch(console.warn);
  }, []);

  // 每分钟增加实际工作时间
  useEffect(() => {
    const interval = setInterval(() => {
      const s = useHealthStore.getState();
      if (!s.isPaused && !s.isIdle && !s.lockScreen.active) {
        s.incrementWorkMinutes(1);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // 每 5 分钟将今日统计同步到历史记录（锁屏未启用时也需要记录）
  useEffect(() => {
    const interval = setInterval(() => {
      useHealthStore.getState().updateDailyStats();
    }, 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
      // 组件卸载前保存一次
      useHealthStore.getState().updateDailyStats();
    };
  }, []);

  // 订阅后端事件
  useEffect(() => {
    // Bug N10: cancelled flag 防止组件卸载后异步注册的监听器泄漏
    let cancelled = false;
    let unlistenCountdown: (() => void) | null = null;
    let unlistenLockOpen: (() => void) | null = null;
    let unlistenIdle: (() => void) | null = null;
    let unlistenPause: (() => void) | null = null;
    let unlistenSettings: (() => void) | null = null;
    let unlistenLockCompleted: (() => void) | null = null;
    let unlistenAppRestored: (() => void) | null = null;

    const setupListeners = async () => {
      // 系统锁屏/解锁事件
      listen('system-locked', () => timerSetSystemLocked(true).catch(console.warn));
      listen('system-unlocked', () => timerSetSystemLocked(false).catch(console.warn));

      // 倒计时更新事件
      unlistenCountdown = await onCountdownUpdate((countdowns) => {
        updateCountdowns(countdowns);

        const currentTasks = useHealthStore.getState().tasks;

        // 清理已不在预通知窗口的任务，避免任务重置后预通知失效
        for (const id of [...notifiedPre.current]) {
          const task = currentTasks.find((t) => t.id === id);
          if (!task) {
            notifiedPre.current.delete(id);
            continue;
          }
          const remaining = countdowns[id];
          if (remaining === undefined || remaining <= 0 || remaining > task.preNotificationSeconds) {
            notifiedPre.current.delete(id);
          }
        }

        const previewTarget = currentTasks.reduce<{ id: string; title: string; icon: string; remaining: number; preNotificationSeconds: number } | null>(
          (best, task) => {
            const remaining = countdowns[task.id];
            if (remaining === undefined) return best;
            if (!task.enabled || task.preNotificationSeconds <= 0) return best;
            if (remaining <= 0 || remaining > task.preNotificationSeconds) return best;
            if (!best || remaining < best.remaining) {
              return { id: task.id, title: task.title, icon: task.icon, remaining, preNotificationSeconds: task.preNotificationSeconds };
            }
            return best;
          },
          null
        );

        if (previewTarget) {
          emit('floating-preview-update', previewTarget);
          if (!floatingVisible.current) {
            floatingVisible.current = true;
            showFloatingWindow().catch(console.warn);
          }

          if (!notifiedPre.current.has(previewTarget.id)) {
            notifiedPre.current.add(previewTarget.id);
            invoke('show_notification', { title: previewTarget.title, body: t('timerCarousel.preNotificationBody') }).catch(console.warn);
            playNotificationSound(previewTarget.id).catch(console.warn);
          }
        } else {
          if (floatingVisible.current) {
            floatingVisible.current = false;
            hideFloatingWindow().catch(console.warn);
          }
        }
      });
      if (cancelled) { unlistenCountdown?.(); return; }

      // 锁屏打开事件 — 仅创建全屏 slave 窗口，不在主窗口绘制锁屏叠加层
      unlistenLockOpen = await onLockScreenOpen(async (taskId, _remaining, mergedIds) => {
        const currentState = useHealthStore.getState();
        const latestSettings = currentState.settings;
        if (!latestSettings.lockScreenEnabled) {
          const store = useHealthStore.getState();
          const allIds = [taskId, ...mergedIds];
          for (const id of allIds) {
            const task = store.tasks.find((t) => t.id === id);
            if (!task) continue;
            if (task.id === 'sit') store.incrementSitBreaks();
            else if (task.id === 'water') store.incrementWaterCups();
            else if (task.id === 'eye') store.incrementEyeCare();
            else store.incrementCustomBreaks();
          }
          timerResetTask(taskId).catch(console.warn);
          for (const id of mergedIds) {
            timerResetTask(id).catch(console.warn);
          }
          const firstTask = store.tasks.find((t) => t.id === taskId);
          if (firstTask) {
            showNotification(firstTask.title, firstTask.desc || '').catch(console.warn);
            playNotificationSound(taskId).catch(console.warn);
          }
          return;
        }

        // 锁屏已激活时不重复创建 slave 窗口（合并后只会有一条事件，加 guard 防异常）
        if (lockScreenCreating.current) {
          return;
        }

        const currentTasks = currentState.tasks;
        const task = currentTasks.find((t) => t.id === taskId);

        if (task) {
          lockScreenCreating.current = true;
          openLockScreen(taskId, task.lockDuration ?? 60, mergedIds);
          await timerSetLockScreenActive(true).catch(console.warn);
          await enterLockMode({
            title: task.title,
            desc: task.desc,
            duration: task.lockDuration ?? 60,
            icon: task.icon,
            strictMode: latestSettings.strictMode,
            allowStrictSnooze: latestSettings.allowStrictSnooze ?? false,
            maxSnoozeCount: latestSettings.maxSnoozeCount ?? 3,
            snoozeMinutes: task.snoozeMinutes ?? 5,
            currentSnoozeCount: 0,
            autoUnlock: latestSettings.autoUnlock,
          }).catch(console.warn);
        }
      });
      if (cancelled) { unlistenLockOpen?.(); return; }

      // 空闲状态变更事件
      unlistenIdle = await onIdleStatusChanged(({ is_idle }) => {
        setIdle(is_idle);
      });
      if (cancelled) { unlistenIdle?.(); return; }

      // 暂停状态更新事件
      unlistenPause = await onPauseStateUpdate((paused) => {
        setPaused(paused);
      });
      if (cancelled) { unlistenPause?.(); return; }

      // 设置更新事件
      unlistenSettings = await onSettingsUpdate((settings) => {
        updateSettings(settings as any);
      });
      if (cancelled) { unlistenSettings?.(); return; }

      // 锁屏完成事件（来自 slave 窗口）
      unlistenLockCompleted = await listen<{ completed: boolean }>('lock-screen-completed', (event) => {
        lockScreenCreating.current = false;
        closeLockScreen(event.payload.completed);
      });
      if (cancelled) { unlistenLockCompleted?.(); return; }

      // 窗口恢复事件（从托盘恢复时触发渲染唤醒）
      unlistenAppRestored = await listen<null>('app-restored', async () => {
        const latest = await getCountdowns().catch(() => null);
        if (latest) updateCountdowns(latest);
        setRestoreCount((c) => c + 1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              void document.body.offsetHeight;
            });
          });
        });
      });
      if (cancelled) { unlistenAppRestored?.(); return; }
    };

    setupListeners().catch(console.warn);

    // 托盘菜单事件
    const unlistenResetAll = listen<null>('reset-all-tasks', () => {
      resetAllTasks();
      timerResetAll().catch(console.warn);
    });

    const unlistenTogglePause = listen<null>('toggle-pause', async () => {
      const currentPaused = useHealthStore.getState().isPaused;
      const nextPaused = !currentPaused;
      try {
        if (nextPaused) {
          await pauseTimer();
        } else {
          await resumeTimer();
        }
        // 后端调用成功后再更新前端状态，避免前后端状态不一致
        setPaused(nextPaused);
        await updatePauseMenu(nextPaused).catch(console.warn);
        await emitPauseStateUpdated(nextPaused).catch(console.warn);
      } catch (e) {
        console.warn('toggle-pause failed:', e);
      }
    });

    return () => {
      cancelled = true;
      unlistenCountdown?.();
      unlistenLockOpen?.();
      unlistenIdle?.();
      unlistenPause?.();
      unlistenSettings?.();
      unlistenLockCompleted?.();
      unlistenAppRestored?.();
      unlistenResetAll.then((f) => f());
      unlistenTogglePause.then((f) => f());
    };
  }, [updateCountdowns, setPaused, setIdle, resetAllTasks, updateSettings]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background" onContextMenu={(e) => e.preventDefault()}>
      <Sidebar
        viewMode={viewMode}
        onViewChange={setViewMode}
        theme={settings.theme}
        onThemeChange={handleThemeToggle}
      />

      <div className="flex flex-1 flex-col">
        <header
          className="flex h-[var(--titlebar-height)] shrink-0 items-center justify-between bg-background px-4"
          data-tauri-drag-region
        >
          <div className="flex flex-col">
            <span className="text-base font-bold text-foreground leading-tight">
              {viewMode === 'main' ? t('app.mainTitle') :
               viewMode === 'exercise' ? t('app.exerciseTitle') :
               viewMode === 'stats' ? t('app.statsTitle') :
               t('settings.title')}
            </span>
            {viewMode !== 'settings' && (
              <span className="mt-1 text-xs text-muted-foreground leading-tight">
                {viewMode === 'main' ? t('app.mainSubtitle') :
                 viewMode === 'exercise' ? t('app.exerciseSubtitle') :
                 t('app.statsSubtitle')}
              </span>
            )}
          </div>
          <WindowControls />
        </header>

        <main className="flex-1 overflow-x-clip overflow-y-auto px-4 pb-4">
          {viewMode === 'main' && (
            <div className="mx-auto flex w-[var(--card-area)] flex-col">
              <TimerCards />
              <TodayStats />
            </div>
          )}
          {viewMode === 'exercise' && <ExerciseLibrary />}
          {viewMode === 'stats' && <StatsDashboard />}
          {viewMode === 'settings' && <Settings isStandalone />}
        </main>
      </div>

      {exercisePanel.active && <ExercisePanel />}
      <Toaster />
    </div>
  );
}

export default App;
