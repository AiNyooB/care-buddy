import { useEffect } from 'react';
import { useHealthStore } from '@/store';
import { onPauseStateUpdate } from '@/services';

export function usePauseStateSync() {
  useEffect(() => {
    const unlisten = onPauseStateUpdate((paused) => {
      useHealthStore.getState().setPaused(paused);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);
}
