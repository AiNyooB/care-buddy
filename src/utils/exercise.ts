/**
 * 运动工具函数
 */

import { guidedExerciseConfigs } from '../data/guided-configs';
import type { GuidedConfig } from '../types';

const FALLBACK_DURATION = 30;

function getExerciseDuration(exerciseId: string): number {
  const config = guidedExerciseConfigs[exerciseId];
  if (!config?.guidedConfig) return FALLBACK_DURATION;

  const cfg: GuidedConfig = config.guidedConfig;
  const cycleSec = cfg.cycle.reduce((s, step) => s + step.duration, 0);
  const transitionsSec = (cfg.cycle.length * cfg.repetitions - 1) * (cfg.transitionDuration ?? 0.3);
  const prepSec = cfg.prepCountdown ?? 3;

  return Math.round(prepSec + cycleSec * cfg.repetitions + transitionsSec);
}

export function computeExerciseDuration(exerciseIds?: string[]): number {
  if (!exerciseIds || exerciseIds.length === 0) return 0;
  return exerciseIds.reduce((acc, id) => acc + getExerciseDuration(id), 0);
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
