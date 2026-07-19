/**
 * 运动工具函数
 */

import { guidedExerciseConfigs } from '../data/guided-configs';
import type { GuidedConfig, Task } from '../types';

const FALLBACK_DURATION = 30;
const ROUND_ENDING_TRANSITION = 0.3;
const ROUND_COMPLETE_SEC = 0.8;
const PREP_DELAY_SEC = 0.7;

function getExerciseDuration(exerciseId: string): number {
  const config = guidedExerciseConfigs[exerciseId];
  if (!config?.guidedConfig) return FALLBACK_DURATION;

  const cfg: GuidedConfig = config.guidedConfig;
  if (config.isContinuous) {
    return cfg.cycle.reduce((s, step) => s + step.duration, 0);
  }

  const reps = cfg.repetitions;
  const stepsInCycle = cfg.cycle.length;
  const transDuration = cfg.transitionDuration ?? 0.3;
  const cycleSec = cfg.cycle.reduce((s, step) => s + step.duration, 0);

  // step→step (每个 cycle 内 steps-1 次 × repetitions)
  const stepTransitions = (stepsInCycle - 1) * reps * transDuration;
  // 每轮最后一步→roundComplete/done 过渡 (硬编码 0.3s × repetitions)
  const roundEndingTransitions = reps * ROUND_ENDING_TRANSITION;
  // roundComplete 提示 (repetitions-1 次)
  const roundCompletes = Math.max(0, reps - 1) * ROUND_COMPLETE_SEC;
  // prep
  const prepSec = (cfg.prepCountdown ?? 0) + PREP_DELAY_SEC;

  return Math.ceil(prepSec + cycleSec * reps + stepTransitions + roundEndingTransitions + roundCompletes);
}

export function computeExerciseDuration(exerciseIds?: string[]): number {
  if (!exerciseIds || exerciseIds.length === 0) return 0;
  return exerciseIds.reduce((acc, id) => acc + getExerciseDuration(id), 0);
}

/**
 * 合并锁屏运动聚合（模块级纯函数）。
 * primary 在前，merged 中 exerciseIds 非空者按首次出现去重；全部为空返回 []。
 * 覆盖规则：primary 优先（即使与 merged 重复也保留 primary 顺序），merged 之间首次出现去重。
 */
export function aggregateExerciseIds(primary: Task, merged: Task[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (ids?: string[]) => {
    for (const id of ids ?? []) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  };
  push(primary.exerciseIds); // primary 在前
  for (const t of merged) push(t.exerciseIds); // merged 首次出现去重
  return out;
}

/**
 * 格式化运动时长（编辑器内显示用）
 * - ≤ 60s：`~{n}s`（带 ~ 表示约略）
 * - \> 60s：`~{m}min`（整数无小数，非整数 1 位小数）
 */
export function formatExerciseDuration(seconds: number): string {
  if (seconds <= 0) return '~0s';
  if (seconds <= 60) return `~${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  const formatted = Number.isInteger(minutes)
    ? String(minutes)
    : minutes.toFixed(1);
  return `~${formatted}min`;
}
