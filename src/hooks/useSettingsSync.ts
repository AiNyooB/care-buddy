import { useEffect } from 'react';
import { useHealthStore } from '@/store';
import { onSettingsUpdate } from '@/services';

export function useSettingsSync() {
  useEffect(() => {
    const unlisten = onSettingsUpdate((settings) => {
      useHealthStore.getState().updateSettings(settings as any);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);
}
