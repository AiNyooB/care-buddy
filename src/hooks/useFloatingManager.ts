/**
 * useFloatingManager — 浮窗可见性 & dismissed 事件管理
 *
 * 职责：
 * 1. 监听 `floating-task-dismissed` 事件，归位浮窗可见性 + 预通知去重集合，
 *    并在 action === 'done' 时调用 `recordTaskCompletion` 统计。
 * 2. 监听 store.lockScreen.active，锁屏退出后归位浮窗状态（避免下次显示卡死）。
 *
 * 共享状态使用 eventCoordinator，避免 useCountdownSync 与本 hook 之间的 ref 泄漏。
 */
import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useHealthStore } from '@/store';
import { eventCoordinator } from '@/services/eventCoordinator';
import { recordTaskCompletion } from '@/utils/statsRecorder';

export function useFloatingManager() {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const unlisten = listen<{ taskId: string; mergedIds?: string[]; action: 'done' | 'snooze' }>(
      'floating-task-dismissed',
      (event) => {
        if (!mountedRef.current) return;
        eventCoordinator.floatingVisible = false;
        eventCoordinator.notifiedPre.clear();
        // Done 操作：统一走 recordTaskCompletion 幂等守卫
        if (event.payload.action === 'done') {
          const allIds = [event.payload.taskId, ...(event.payload.mergedIds ?? [])];
          allIds.forEach((id) => recordTaskCompletion(id));
        }
      },
    );

    return () => {
      mountedRef.current = false;
      unlisten.then((fn) => fn());
    };
  }, []);

  // lock-screen-completed 的 ref 清理改用 store 订阅（与 useLockScreenEvents 的事件监听去重）
  const lockScreenActive = useHealthStore((s) => s.lockScreen.active);
  useEffect(() => {
    if (!lockScreenActive) {
      eventCoordinator.floatingVisible = false;
      eventCoordinator.notifiedPre.clear();
    }
  }, [lockScreenActive]);
}
