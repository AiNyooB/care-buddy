import { useEffect } from 'react';
import { listen, timerSetSystemLocked } from '@/services';

export function useSystemLockEvents() {
  useEffect(() => {
    const unlistenLocked = listen('system-locked', () => timerSetSystemLocked(true).catch(console.warn));
    const unlistenUnlocked = listen('system-unlocked', () => timerSetSystemLocked(false).catch(console.warn));
    return () => {
      unlistenLocked.then((f) => f());
      unlistenUnlocked.then((f) => f());
    };
  }, []);
}
