import { useEffect, useRef } from 'react';
import { useHealthStore } from '@/store';
import { syncTasks, isTimerPaused, wasStartedSilent, hideWindow } from '@/services';

export function useAppInit() {
  const tasksLoaded = useRef(false);

  useEffect(() => {
    if (tasksLoaded.current) return;
    tasksLoaded.current = true;

    useHealthStore.getState().checkDayTransition();

    let mounted = true;
    const init = async () => {
      const tasks = useHealthStore.getState().tasks;
      await syncTasks(tasks).catch(console.warn);
      if (!mounted) return;

      const paused = await isTimerPaused().catch(() => false);
      if (!mounted) return;
      useHealthStore.getState().setPaused(paused);

      const silent = await wasStartedSilent().catch(() => false);
      if (!mounted) return;
      if (silent) {
        await hideWindow().catch(console.warn);
      }
    };

    init().catch(console.warn);
    return () => { mounted = false; };
  }, []);
}
