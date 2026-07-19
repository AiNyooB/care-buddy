import { useEffect } from 'react';
import { useHealthStore } from '@/store';

export function useDailyStatsAutoSave() {
  useEffect(() => {
    const interval = setInterval(() => {
      useHealthStore.getState().updateDailyStats();
    }, 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
      useHealthStore.getState().updateDailyStats();
    };
  }, []);
}
