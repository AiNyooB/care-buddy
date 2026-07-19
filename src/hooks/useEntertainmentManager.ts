/**
 * useEntertainmentManager — 娱乐模式窗口 dismissed 事件管理
 *
 * 职责：
 * 监听 `entertainment-task-dismissed` 事件，在主窗口完成：
 * - action === 'done'：对 allIds 调 resetTask + recordTaskCompletion（统计写入主窗口 localStorage）。
 * - action === 'snooze'：snooze IPC 已在娱乐窗口本地执行，主窗口无需重复。
 *
 * 架构说明（FE-1.1 修复）：
 * 娱乐窗口是独立 webview，localStorage 与主窗口隔离。若在娱乐窗口内直接调
 * recordTaskCompletion，统计会被写入娱乐窗口的隔离 localStorage，主窗口永远读不到。
 * 因此把 reset + stats 移回主窗口，通过 dismissed 事件中转，与
 * FloatingPreview/useFloatingManager 架构对齐。
 *
 * 娱乐模式与 floating 模式完全独立，事件不复用。
 */
import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useHealthStore } from '@/store';
import { recordTaskCompletion } from '@/utils/statsRecorder';

export function useEntertainmentManager() {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const unlisten = listen<{ taskId: string; mergedIds?: string[]; action: 'done' | 'snooze' }>(
      'entertainment-task-dismissed',
      (event) => {
        if (!mountedRef.current) return;
        if (event.payload.action !== 'done') return;

        // allIds 由 EntertainmentPreview 构造为 [taskId, ...mergedIds]，
        // taskId 是虚拟 ID "entertainment-unified"，mergedIds 是真实任务 ID。
        // resetTask 对虚拟 ID 是 no-op（后端按 tasks 表查找），对真实任务 ID 执行重置；
        // recordTaskCompletion 按 ID 分发到对应统计字段（sit/water/eye/custom）。
        const allIds = [
          event.payload.taskId,
          ...(event.payload.mergedIds ?? []),
        ];
        allIds.forEach((id) => {
          useHealthStore.getState().resetTask(id).catch(console.warn);
          recordTaskCompletion(id);
        });
      },
    );

    return () => {
      mountedRef.current = false;
      unlisten.then((fn) => fn());
    };
  }, []);
}
