import { useEffect } from 'react';
import { emit } from '@tauri-apps/api/event';
import { useHealthStore } from '@/store';
import { listen, pauseTimer, resumeTimer, updatePauseMenu, emitPauseStateUpdated } from '@/services';

export function useTrayMenuEvents() {
  useEffect(() => {
    const unlistenResetAll = listen<null>('reset-all-tasks', async () => {
      // store action 内部调 IPC + 错误处理，返回 boolean 表示是否成功
      const ok = await useHealthStore.getState().resetAllTasks();
      // 仅在 reset 成功时通知浮窗清空触发态队列，避免 IPC 失败后浮窗清空但后端仍 triggered
      if (ok) emit('floating-reset-all', {});
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
        useHealthStore.getState().setPaused(nextPaused);
        await updatePauseMenu(nextPaused).catch(console.warn);
        await emitPauseStateUpdated(nextPaused).catch(console.warn);
      } catch (e) {
        console.warn('toggle-pause failed:', e);
      }
    });

    return () => {
      unlistenResetAll.then((f) => f());
      unlistenTogglePause.then((f) => f());
    };
  }, []);
}
