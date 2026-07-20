/**
 * 统计记录器 — 单一入口 + 幂等守卫
 *
 * 三条路径统一调用：
 * - closeLockScreen 内（useLockScreenEvents）
 * - task-notification 监听内（useLockScreenEvents）
 * - floating-task-dismissed 监听内（useFloatingManager）
 *
 * 幂等守卫：按 taskId 维度，500ms 内同一任务不重复计数。
 * 使用 Map<string, number> 而非单字段，避免多任务并发互相覆盖。
 *
 * 不再用 countdown > 0 作主防线：浮窗 Done 路径下 resetTask 先 resolve 触发
 * task-reset-confirmed 把 countdown 回填为正数，再 emit floating-task-dismissed
 * 时 countdown 守卫会拦截 → 漏计数。500ms 窗口已足够防同一 tick 重复 emit。
 */
import { eventCoordinator } from '@/services/eventCoordinator';
import { useHealthStore } from '@/store/healthStore';

export function recordTaskCompletion(taskId: string) {
  // 按 taskId 维度幂等：500ms 内同一任务不重复计数（覆盖同一 tick 重复 emit / 多路径并发）
  const now = Date.now();
  const last = eventCoordinator.lastRecordedTaskTime.get(taskId);
  if (last !== undefined && now - last < 500) {
    return;
  }
  eventCoordinator.lastRecordedTaskTime.set(taskId, now);

  const state = useHealthStore.getState();
  // 按 taskId 分发到对应 increment 方法
  if (taskId === 'sit') state.incrementSitBreaks();
  else if (taskId === 'water') state.incrementWaterCups();
  else if (taskId === 'eye') state.incrementEyeCare();
  else state.incrementCustomBreaks();
  state.updateDailyStats();
}
