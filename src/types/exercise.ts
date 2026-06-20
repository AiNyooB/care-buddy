/**
 * 运动库类型定义
 */

export type ExercisePriority = 'core' | 'strong' | 'recommend' | 'supplement';
export type ExerciseCategory = 'spine' | 'circulation' | 'metabolism' | 'vision' | 'wrist';

// ============================================================================
// 引导锻炼类型
// ============================================================================

/** 引导模式中的一个步骤 */
export interface GuidedStep {
  text: string;           // TTS 播报文本（如 "闭合双眼"）
  instruction: string;    // UI 显示指引（如 "轻轻闭合双眼，保持2秒"）
  duration: number;       // 本步持续秒数（>= 1）
}

/** 引导锻炼配置 */
export interface GuidedConfig {
  cycle: GuidedStep[];    // 一个重复周期内的步骤序列
  repetitions: number;    // 周期重复次数
  prepCountdown?: number; // 每步开始前倒计时秒数（默认 3）
}

// ============================================================================
// 运动库类型
// ============================================================================

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  priority: ExercisePriority;
  description: string;
  instructions: string;
  duration: string;
  repetitions?: number;
  holdTime?: number; // 秒
  sets?: number;
  requiresStanding: boolean;
  spaceRequired: boolean; // 是否需要额外空间
  evidenceSource: string;
  targetArea: string;
  whyImportant: string;
  // 引导锻炼
  guidedConfig?: GuidedConfig;  // 有则进入引导模式，自动步进
  isContinuous?: boolean;       // true=持续活动（无分步，仅总计时）
}

export interface ExercisePackage {
  id: string;
  name: string;
  description: string;
  duration: number; // 分钟
  exercises: { exerciseId: string; repetitions?: number; duration?: string }[];
  recommendedFrequency: string;
}

export interface ExerciseSession {
  id: string;
  packageId: string;
  exercisesCompleted: string[];
  startTime: number;
  endTime?: number;
  completed: boolean;
}
