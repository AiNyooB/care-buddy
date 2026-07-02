import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { emit, listen } from '@tauri-apps/api/event';
import { useHealthStore } from '@/store';
import {
  onCountdownUpdate,
  showFloatingWindow,
  hideFloatingWindow,
  showNotification,
  playNotificationSound,
} from '@/services';

export function useCountdownSync() {
  const { t } = useTranslation();
  const notifiedPre = useRef(new Set<string>());
  const floatingVisible = useRef(false);

  useEffect(() => {
    const unlisten = onCountdownUpdate((countdowns) => {
      const state = useHealthStore.getState();
      state.updateCountdowns(countdowns);

      // 空闲时不触发任何预通知/声音/悬浮窗
      if (state.isIdle) return;

      const currentTasks = state.tasks;

      for (const id of [...notifiedPre.current]) {
        const task = currentTasks.find((t) => t.id === id);
        if (!task || !task.enabled) {
          notifiedPre.current.delete(id);
          continue;
        }
        const remaining = countdowns[id];
        if (remaining === undefined || remaining > task.preNotificationSeconds) {
          notifiedPre.current.delete(id);
        }
      }

      const previewTasks = currentTasks.filter((task) => {
        const remaining = countdowns[task.id];
        if (remaining === undefined) return false;
        if (!task.enabled || task.preNotificationSeconds <= 0) return false;
        if (remaining <= 0 || remaining > task.preNotificationSeconds) return false;
        return true;
      });

      const previewTarget = previewTasks.length > 0
        ? previewTasks.reduce<{
            id: string; title: string; icon: string; remaining: number; preNotificationSeconds: number; otherCount: number;
          }>((best, task) => {
            const remaining = countdowns[task.id]!;
            if (!best || remaining < best.remaining) {
              return { id: task.id, title: task.title, icon: task.icon, remaining, preNotificationSeconds: task.preNotificationSeconds, otherCount: 0 };
            }
            return best;
          }, null!)
        : null;

      if (previewTarget) {
        previewTarget.otherCount = previewTasks.length - 1;

        emit('floating-preview-update', previewTarget);
        if (!floatingVisible.current) {
          floatingVisible.current = true;
          showFloatingWindow().catch(console.warn);
        }

        if (!notifiedPre.current.has(previewTarget.id)) {
          notifiedPre.current.add(previewTarget.id);
          showNotification(previewTarget.title, t('timerCarousel.preNotificationBody', { defaultValue: '即将提醒' })).catch(console.warn);
          playNotificationSound(previewTarget.id).catch(console.warn);
        }
      } else {
        if (floatingVisible.current) {
          floatingVisible.current = false;
          hideFloatingWindow().catch(console.warn);
        }
      }
    });

    const unlistenLockCompleted = listen<{ completed: boolean }>('lock-screen-completed', () => {
      floatingVisible.current = false;
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenLockCompleted.then((fn) => fn());
    };
  }, [t]);
}
