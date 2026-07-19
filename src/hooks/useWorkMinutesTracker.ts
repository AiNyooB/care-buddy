import { useEffect } from 'react';
import { useHealthStore } from '@/store';

export function useWorkMinutesTracker() {
  useEffect(() => {
    const interval = setInterval(() => {
      const s = useHealthStore.getState();
      if (!s.isPaused && !s.isIdle && !s.lockScreen.active) {
        s.incrementWorkMinutes(1);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);
}
