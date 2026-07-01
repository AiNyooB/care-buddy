import { useEffect, useRef } from 'react';
import { useHealthStore } from '@/store';
import {
  onLockScreenOpen,
  enterLockMode,
  timerSetLockScreenActive,
  timerResetTask,
  showNotification,
  playNotificationSound,
  listen,
} from '@/services';
import { computeExerciseDuration } from '@/utils/exercise';
import type { AppSettings, Task } from '@/types';

function shouldUseExercise(task: Task, settings: AppSettings): boolean {
  return Boolean(settings.lockScreenExerciseEnabled) && Boolean(task.isExerciseTask);
}

export function useLockScreenEvents() {
  const lockScreenCreating = useRef(false);

  useEffect(() => {
    let unlistenLockOpen: (() => void) | null = null;
    let unlistenLockCompleted: (() => void) | null = null;

    const setup = async () => {
      unlistenLockOpen = await onLockScreenOpen(async (taskId, _remaining, mergedIds) => {
        const state = useHealthStore.getState();
        const latestSettings = state.settings;

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
          return;
        }

        if (lockScreenCreating.current) return;

        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          lockScreenCreating.current = true;
          const useExercise = shouldUseExercise(task, latestSettings);
          const computedDuration = useExercise
            ? computeExerciseDuration(task.exerciseIds)
            : 0;
          const duration = useExercise && computedDuration > 0
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
            isExerciseMode: useExercise,
            exerciseIds: useExercise ? (task.exerciseIds ?? []) : [],
          }).catch(console.warn);
        }
      });

      unlistenLockCompleted = await listen<{ completed: boolean }>('lock-screen-completed', (event) => {
        lockScreenCreating.current = false;
        useHealthStore.getState().closeLockScreen(event.payload.completed);
      });
    };

    setup().catch(console.warn);

    return () => {
      unlistenLockOpen?.();
      unlistenLockCompleted?.();
    };
  }, []);
}
