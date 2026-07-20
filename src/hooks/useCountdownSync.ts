/**
 * useCountdownSync — 倒计时同步核心
 *
 * 职责（精简后）：
 * 1. 监听 `countdown-update`：写入 store + 调用 checkTriggerHealing 自愈 +
 *    浮窗预览管理 + 系统通知/声音（预通知窗口内）
 * 2. 监听 `task-reset-confirmed`：后端 emit 的即时单任务确认（避免 0-1000ms 延迟）
 *
 * 已拆分到独立 hook：
 * - 触发自愈监听 → useTriggerHealing
 * - floating-task-dismissed → useFloatingManager
 * - app-mode-changed → useModeTransition
 *
 * 跨 hook 共享状态：eventCoordinator（floatingVisible / notifiedPre / handledTriggers）
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { emit, listen } from '@tauri-apps/api/event';
import { useHealthStore } from '@/store';
import {
  onCountdownUpdate,
  showFloatingWindow,
  hideFloatingWindow,
  showNotification,
  playNotificationSound,
} from '@/services';
import { eventCoordinator } from '@/services/eventCoordinator';
import { runTriggerHealingPass } from './useTriggerHealing';

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

export function useCountdownSync() {
  const { t } = useTranslation();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // HMR 防护：模块级 singleton 可能保留上一次 mount 的状态，主动清理
    eventCoordinator.clearAll();

    const unlisten = onCountdownUpdate((countdowns, entertainment) => {
      if (!mountedRef.current) return;
      const state = useHealthStore.getState();
      state.updateCountdowns(countdowns);
      state.setEntertainmentCountdown(entertainment);

      // 触发态自愈（单线程调用，mutate eventCoordinator.triggerStreak / handledTriggers）
      runTriggerHealingPass(countdowns);

      // 空闲时不触发任何预通知/声音/悬浮窗
      if (state.isIdle) {
        // 空闲期间归位可见性 ref：useIdleDetection 会直接 hide 窗口但不重置本 ref，
        // 若不归位，打破空闲后 reconcile 会误以为窗口仍在显示而永不重开（always 策略胶囊不恢复）
        eventCoordinator.floatingVisible = false;
        return;
      }

      // 娱乐模式激活时跳过浮窗/通知/声音（娱乐模式有独立的 entertainment-window）
      if (state.entertainmentActive) {
        eventCoordinator.floatingVisible = false;
        return;
      }

      const appMode = state.appMode;
      const currentTasks = state.tasks;

      // 预通知去重集合清理：任务离开预通知窗口或被禁用时移除
      for (const id of [...eventCoordinator.notifiedPre]) {
        const task = currentTasks.find((tk) => tk.id === id);
        if (!task || !task.enabled) {
          eventCoordinator.notifiedPre.delete(id);
          continue;
        }
        const remaining = countdowns[id]?.remaining;
        if (remaining === undefined || remaining > task.preNotificationSeconds) {
          eventCoordinator.notifiedPre.delete(id);
        }
      }

      const isFloating = appMode === 'floating';
      const { floatingDisplayStrategy } = useHealthStore.getState().settings;
      const shouldSkipAutoShow = isFloating && floatingDisplayStrategy !== 'always';

      // 浮窗模式下常驻显示最近一条提醒；其它模式下只在预通知窗口内显示
      const candidateTasks = currentTasks.filter((task) => {
        const info = countdowns[task.id];
        const remaining = info?.remaining;
        if (remaining === undefined) return false;
        if (!task.enabled) return false;
        if (isFloating) {
          // 浮窗模式：保留已触发的任务（triggered=true），不依赖 floating-task-triggered 作为唯一入口
          if (remaining <= 0 && !info?.triggered) return false;
          return true;
        }
        if (task.preNotificationSeconds <= 0) return false;
        return remaining <= task.preNotificationSeconds;
      });

      const previewTarget = candidateTasks.length > 0
        ? candidateTasks.reduce<PreviewPayload | null>((best, task) => {
            const remaining = countdowns[task.id]?.remaining ?? 0;
            if (best === null || remaining < best.remaining) {
              return {
                taskId: task.id,
                title: task.title,
                desc: task.desc,
                icon: task.icon,
                remaining,
                interval: task.interval,
                preNotificationSeconds: task.preNotificationSeconds,
                otherCount: 0,
              };
            }
            return best;
          }, null)
        : null;

      if (previewTarget) {
        previewTarget.otherCount = candidateTasks.length - 1;

        // 始终发送预览数据（Rust 显示胶囊时需要用）
        emit('floating-preview-update', previewTarget);

        // "always" 策略：前端管理显示；"app-matched"/"on-trigger"：Rust 管理显示
        if (!eventCoordinator.floatingVisible && !shouldSkipAutoShow) {
          eventCoordinator.floatingVisible = true;
          showFloatingWindow().catch(console.warn);
        }

        // 浮窗/通知模式下只显示浮窗，不弹系统通知/声音。
        // 对预通知窗口内的每个候选任务独立发一次提前提醒，避免扎堆时被"最小剩余"者压制。
        if (appMode !== 'floating' && appMode !== 'notification') {
          for (const task of candidateTasks) {
            if (task.preNotificationSeconds > 0 && !eventCoordinator.notifiedPre.has(task.id)) {
              eventCoordinator.notifiedPre.add(task.id);
              showNotification(
                task.title,
                t('timerCarousel.preNotificationBody', { defaultValue: '即将提醒' }),
              ).catch(console.warn);
              playNotificationSound(task.id).catch(console.warn);
            }
          }
        }
      } else {
        // 浮窗模式下浮窗保持可见，等待用户完成/延后；切回其它模式且无预览时再隐藏
        if (eventCoordinator.floatingVisible && (appMode !== 'floating' || shouldSkipAutoShow)) {
          eventCoordinator.floatingVisible = false;
          hideFloatingWindow().catch(console.warn);
        }
      }
    });

    // task-reset-confirmed：后端 reset_task / reset_all 后立即 emit 的单任务确认事件。
    // 携带完整状态字段（countdown/paused/snoozed），前端直接镜像写入，避免等待下一次 countdown-update。
    const unlistenReset = listen<{
      task_id: string;
      countdown: number;
      triggered: boolean;
      paused: boolean;
      snoozed: boolean;
    }>('task-reset-confirmed', (event) => {
      if (!mountedRef.current) return;
      const { task_id, ...payload } = event.payload;
      useHealthStore.getState().updateTaskCountdown(task_id, payload);
      // reset 后该任务的触发态标记应清除，允许下次触发时重新自愈
      eventCoordinator.handledTriggers.delete(task_id);
      delete eventCoordinator.triggerStreak[task_id];
    });

    return () => {
      mountedRef.current = false;
      unlisten.then((fn) => fn());
      unlistenReset.then((fn) => fn());
    };
  }, [t]);
}
