/**
 * EventCoordinator — 跨 hook 共享的可变状态（module-level singleton）
 *
 * 这些 ref 不参与渲染，不需要 React 生命周期管理。
 * App 卸载 = 进程退出，无需 cleanup。各 hook 直接 import 使用。
 *
 * HMR 注意：模块级 singleton 在 Vite HMR 下会保留旧状态。useCountdownSync
 * mount 时调用 clearAll() 主动清理，避免开发期状态泄漏。
 */
class EventCoordinator {
  /** 触发态自愈去重：已请求重发的 triggered 任务 */
  readonly handledTriggers = new Set<string>();
  /** 浮窗可见性（用于 showFloatingWindow 去重） */
  floatingVisible = false;
  /** 预通知去重 */
  readonly notifiedPre = new Set<string>();
  /** 统计计数幂等：按 taskId 维度记录上次时间戳（500ms 窗口） */
  readonly lastRecordedTaskTime: Map<string, number> = new Map();
  /** 连续帧观测到 triggered 的计数（自愈用，要求 ≥2 帧才重发） */
  readonly triggerStreak: Record<string, number> = {};

  /** 清触发态相关标记（handledTriggers + notifiedPre + triggerStreak） */
  clearTriggerState() {
    this.handledTriggers.clear();
    this.notifiedPre.clear();
    for (const k of Object.keys(this.triggerStreak)) delete this.triggerStreak[k];
  }

  /** 完整重置（mount 时调用防 HMR 状态泄漏） */
  clearAll() {
    this.clearTriggerState();
    this.floatingVisible = false;
    this.lastRecordedTaskTime.clear();
  }
}

export const eventCoordinator = new EventCoordinator();
