/**
 * useModeTransition — 应用模式切换时的浮窗可见性处理
 *
 * 监听 `app-mode-changed` 事件，在切换到/自 floating 模式时
 * 立即调整浮窗可见性（不等下一次 countdown-update）。
 *
 * 共享状态：eventCoordinator.floatingVisible
 */
import { useEffect } from 'react';
import { emit } from '@tauri-apps/api/event';
import { useHealthStore } from '@/store';
import { eventCoordinator } from '@/services/eventCoordinator';
import { onAppModeUpdate, showFloatingWindow, hideFloatingWindow } from '@/services';

interface PreviewPayload {
  taskId: string;
  title: string;
  desc: string;
  icon: string;
  remaining: number;
  interval: number;
  preNotificationSeconds: number;
  otherCount: number;
}

/**
 * 从当前 store 中选出最近一个 enabled 且 countdown > 0 的任务，
 * 发送 floating-preview-update 给浮窗。
 */
function emitPreviewUpdate() {
  const state = useHealthStore.getState();
  const taskStates = state.taskStates;
  const candidate = state.tasks
    .filter((task) => {
      if (!task.enabled) return false;
      const remaining = taskStates[task.id]?.countdown;
      return remaining !== undefined && remaining > 0;
    })
    .sort(
      (a, b) =>
        (taskStates[a.id]?.countdown ?? Infinity) - (taskStates[b.id]?.countdown ?? Infinity),
    )[0];

  if (!candidate) return;

  const payload: PreviewPayload = {
    taskId: candidate.id,
    title: candidate.title,
    desc: candidate.desc,
    icon: candidate.icon,
    remaining: taskStates[candidate.id]!.countdown,
    interval: candidate.interval,
    preNotificationSeconds: candidate.preNotificationSeconds,
    otherCount: 0,
  };
  emit('floating-preview-update', payload);
}

export function useModeTransition() {
  useEffect(() => {
    const unlisten = onAppModeUpdate(({ mode, displayStrategy }) => {
      if (mode === 'floating') {
        // "app-matched"/"on-trigger"：前端不管理窗口可见性，由 Rust 控制
        if (displayStrategy !== 'always') {
          // "on-trigger" 如有残留可见窗口，立即隐藏
          if (displayStrategy === 'on-trigger' && eventCoordinator.floatingVisible) {
            eventCoordinator.floatingVisible = false;
            hideFloatingWindow().catch(console.warn);
          }
          // 重置引用，确保切回 "always" 时能重新显示
          eventCoordinator.floatingVisible = false;
          // 仍然发送预览数据
          emitPreviewUpdate();
          return;
        }

        // "always" 策略：切换时立即显示
        emitPreviewUpdate();
        if (!eventCoordinator.floatingVisible) {
          // 娱乐模式激活时不显示浮窗，避免浮窗胶囊闪现
          if (useHealthStore.getState().entertainmentActive) return;
          eventCoordinator.floatingVisible = true;
          showFloatingWindow().catch(console.warn);
        }
      } else if (
        (mode === 'notification' || mode === 'lock') &&
        eventCoordinator.floatingVisible
      ) {
        // 从浮窗模式切回其它模式，且当前没有预览任务时，立即隐藏浮窗
        const state = useHealthStore.getState();
        const countdowns = state.taskStates;
        const hasPreview = state.tasks.some((task) => {
          if (!task.enabled || task.preNotificationSeconds <= 0) return false;
          const remaining = countdowns[task.id]?.countdown;
          return remaining !== undefined && remaining > 0 && remaining <= task.preNotificationSeconds;
        });
        if (!hasPreview) {
          eventCoordinator.floatingVisible = false;
          hideFloatingWindow().catch(console.warn);
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
