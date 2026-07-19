import { useEffect, useRef } from 'react';
import { useHealthStore } from '@/store';
import {
  onLockScreenOpen,
  enterLockMode,
  timerSetLockScreenActive,
  showNotification,
  playNotificationSound,
  listen,
} from '@/services';
import { aggregateExerciseIds, computeExerciseDuration } from '@/utils/exercise';
import { recordTaskCompletion } from '@/utils/statsRecorder';
import type { AppSettings, Task } from '@/types';

function shouldUseExercise(task: Task, settings: AppSettings): boolean {
  return Boolean(settings.lockScreenExerciseEnabled) && (task.exerciseIds?.length ?? 0) > 0;
}

export function useLockScreenEvents() {
  const lockScreenCreating = useRef(false);

  useEffect(() => {
    let unlistenNotification: (() => void) | null = null;
    let unlistenLockOpen: (() => void) | null = null;
    let unlistenLockCompleted: (() => void) | null = null;

    const setup = async () => {
      // 监听通知模式的任务通知
      unlistenNotification = await listen<{ taskId: string; title: string; desc: string; icon: string }>(
        'task-notification',
        (event) => {
          const { taskId, title, desc } = event.payload;
          showNotification(title, desc).catch(console.warn);
          playNotificationSound(taskId).catch(console.warn);
          // 通知模式：触发时自动累加统计数据（统一走 recordTaskCompletion 幂等守卫）
          recordTaskCompletion(taskId);
          // 通知模式自动完成后 reset 任务（store action 内部调 IPC + 错误处理）
          useHealthStore.getState().resetTask(taskId);
        },
      );

      unlistenLockOpen = await onLockScreenOpen(async (taskId, _remaining, mergedIds) => {
        const state = useHealthStore.getState();
        const latestSettings = state.settings;

        if (lockScreenCreating.current) {
          // 兜底：如果 ref 长时间卡住但 store 已解锁，重置
          if (!useHealthStore.getState().lockScreen.active) {
            lockScreenCreating.current = false;
          } else {
            return;
          }
        }

        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          lockScreenCreating.current = true;
          try {
            const exerciseEnabled = shouldUseExercise(task, latestSettings);
            let effectiveIds: string[] = [];
            if (exerciseEnabled) {
              const mergedTasks = (mergedIds ?? [])
                .map((id) => state.tasks.find((t) => t.id === id))
                .filter((t): t is Task => !!t && (t.exerciseIds?.length ?? 0) > 0);
              effectiveIds = aggregateExerciseIds(task, mergedTasks);
            }
            const exerciseActive = effectiveIds.length > 0;
            const computedDuration = exerciseActive
              ? computeExerciseDuration(effectiveIds)
              : 0;
            const duration = exerciseActive && computedDuration > 0
              ? computedDuration
              : (task.lockDuration ?? 60);

            state.openLockScreen(taskId, duration, mergedIds);
            await timerSetLockScreenActive(true).catch(console.warn);
            await enterLockMode({
              title: task.title,
              desc: task.desc,
              duration,
              icon: task.icon,
              strictMode: latestSettings.strictMode,
              allowStrictSnooze: latestSettings.allowStrictSnooze ?? false,
              maxSnoozeCount: latestSettings.maxSnoozeCount ?? 3,
              snoozeMinutes: task.snoozeMinutes ?? 5,
              currentSnoozeCount: 0,
              autoUnlock: latestSettings.autoUnlock,
              isExerciseMode: exerciseActive,
              exerciseIds: exerciseActive ? effectiveIds : [],
            }).catch(console.warn);
          } finally {
            // 锁屏创建成功后由 lock-screen-completed 事件重置 ref
            // 如果创建失败则立刻重置，避免永久死锁
            if (!useHealthStore.getState().lockScreen.active) {
              lockScreenCreating.current = false;
            }
          }
        }
      });

      unlistenLockCompleted = await listen<{ completed: boolean }>('lock-screen-completed', (event) => {
        lockScreenCreating.current = false;
        // 先快照 taskId/mergedIds，closeLockScreen 会清空它们
        const state = useHealthStore.getState();
        const { taskId, mergedIds } = state.lockScreen;
        state.closeLockScreen(event.payload.completed);
        // 完成时记录统计（统一走 recordTaskCompletion 幂等守卫）
        if (event.payload.completed && taskId) {
          const allIds = [taskId, ...mergedIds];
          for (const id of allIds) {
            recordTaskCompletion(id);
          }
        }
      });
    };

    setup().catch(console.warn);

    return () => {
      unlistenNotification?.();
      unlistenLockOpen?.();
      unlistenLockCompleted?.();
    };
  }, []);
}
