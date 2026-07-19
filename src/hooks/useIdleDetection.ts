import { useEffect } from 'react';
import { useHealthStore } from '@/store';
import { onIdleStatusChanged, hideFloatingWindow } from '@/services';

export function useIdleDetection() {
  useEffect(() => {
    const unlisten = onIdleStatusChanged(({ is_idle }) => {
      useHealthStore.getState().setIdle(is_idle);
      // 空闲时隐藏浮窗，避免自动延后机制在任务已重置后继续执行
      if (is_idle) {
        hideFloatingWindow().catch(console.warn);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);
}
