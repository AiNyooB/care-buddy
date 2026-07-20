/**
 * useTriggerHealing — 触发态自愈
 *
 * 后端触发事件（lock-screen-open / task-notification / floating-task-triggered）
 * 为一次性发射，若前端在重订阅窗口前错过则任务永久停在 remaining==0。
 *
 * 此 hook 监听 `floating-task-triggered` 事件标记已处理，
 * 并导出 `runTriggerHealingPass` 纯函数供 useCountdownSync 在 countdown-update 内调用，
 * 避免 dual listener 竞态。
 *
 * 关键设计：
 *  - 同一帧只调用一次 timerReopenTriggered（后端会一次性重发全部 triggered 任务）
 *  - 要求连续 ≥2 帧 observed triggered 才重发，消除与正常分发间的竞态
 */
import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useHealthStore } from '@/store';
import { eventCoordinator } from '@/services/eventCoordinator';
import { timerReopenTriggered, type BackendCountdownInfo } from '@/services';

/**
 * 在 countdown-update 处理函数内调用（单线程调用，禁止在其它 listener 再调一次）。
 * 检查所有任务的触发态，必要时调用 timerReopenTriggered 重发。
 *
 * 副作用：mutate eventCoordinator.triggerStreak / handledTriggers，调用 IPC。
 * 返回 true 表示已触发重发。
 */
export function runTriggerHealingPass(countdowns: Record<string, BackendCountdownInfo>): boolean {
  const state = useHealthStore.getState();
  const lockActive = state.lockScreen.active;

  let needReopen = false;
  for (const [id, info] of Object.entries(countdowns)) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task || !task.enabled) {
      eventCoordinator.handledTriggers.delete(id);
      delete eventCoordinator.triggerStreak[id];
      continue;
    }
    const triggered = info.triggered || info.remaining === 0;
    if (triggered) {
      const streak = (eventCoordinator.triggerStreak[id] ?? 0) + 1;
      eventCoordinator.triggerStreak[id] = streak;
      const notYetHandled = !eventCoordinator.handledTriggers.has(id);
      // 各模式的"尚未接手"条件：通知/浮窗无激活态守卫；锁屏需锁屏未激活
      const modeOpen =
        state.appMode === 'notification' ||
        (state.appMode === 'lock' && !lockActive) ||
        state.appMode === 'floating';
      if (notYetHandled && streak >= 2 && modeOpen) {
        eventCoordinator.handledTriggers.add(id);
        needReopen = true;
      }
    } else {
      eventCoordinator.handledTriggers.delete(id);
      delete eventCoordinator.triggerStreak[id];
    }
  }

  if (needReopen) {
    timerReopenTriggered().catch(console.warn);
  }
  return needReopen;
}

export function useTriggerHealing() {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // HMR 防护：触发态自愈记录归位
    eventCoordinator.handledTriggers.clear();
    for (const k of Object.keys(eventCoordinator.triggerStreak)) {
      delete eventCoordinator.triggerStreak[k];
    }

    // 监听后端分发的 floating-task-triggered 事件，标记已处理
    // 后端在同一 tick 内先 emit floating-task-triggered，再 emit countdown-update，
    // 因此自愈在检查 handledTriggers 时已能看到标记，不会重复重发
    const unlisten = listen<{ taskId: string }>('floating-task-triggered', (event) => {
      if (!mountedRef.current) return;
      eventCoordinator.handledTriggers.add(event.payload.taskId);
      eventCoordinator.triggerStreak[event.payload.taskId] = 0;
    });

    return () => {
      mountedRef.current = false;
      unlisten.then((fn) => fn());
    };
  }, []);
}
