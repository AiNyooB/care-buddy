/**
 * 任务类型定义
 */

// 任务图标类型
export type TaskIcon = 'sit' | 'water' | 'eye' | 'work' | 'exercise';

// 调度类型
export type ScheduleType = 'interval' | 'daily';

// 任务接口
export interface Task {
  id: string;
  title: string;
  desc: string;
  interval: number; // 分钟
  enabled: boolean;
  icon: TaskIcon;
  lockDuration: number; // 秒
  autoResetOnIdle: boolean;
  preNotificationSeconds: number;
  snoozeMinutes: number;
  scheduleType: ScheduleType;
  dailyTimes: string[]; // ['09:00', '14:00']
  debugIntervalSeconds?: number; // 测试用：覆盖 interval，单位秒
  // 运动相关字段
  isExerciseTask?: boolean;
  exercisePackageId?: string;
  exerciseIds?: string[];
}

// 任务状态
export type TaskStatus = 'idle' | 'running' | 'paused' | 'snoozed' | 'locked';

// 应用设置
export interface AppSettings {
  lockScreenEnabled: boolean;
  strictMode: boolean;
  autoUnlock: boolean;
  autoResetOnIdle: boolean;
  allowStrictSnooze: boolean;
  mergeThreshold: number; // 分钟
  idleThreshold: number; // 分钟
  maxSnoozeCount: number;
  soundEnabled: boolean;
  customSoundPath?: string;
  autoStart: boolean;
  silentAutoStart: boolean;
  floatingWindowEnabled: boolean;
  floatingMode: 'next' | 'custom';
  floatingTheme: 'blue' | 'green' | 'teal' | 'slate';
  customBgImagePath?: string;
  theme: 'light' | 'dark' | 'system';
  locale: 'zh-CN' | 'en-US';
}

// 运动分类
export type ExerciseCategory = 'spine' | 'circulation' | 'metabolism' | 'vision' | 'wrist';

// 运动优先级
export type ExercisePriority = 'core' | 'strong' | 'recommend' | 'supplement';

// 运动套餐 ID
export type PackageType = 'package-quick' | 'package-standard' | 'package-deep';

// 运动单元
export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  priority: ExercisePriority;
  description: string;
  instructions: string;
  duration: string;
  repetitions?: number;
  holdTime?: number;
  sets?: number;
  requiresStanding: boolean;
  spaceRequired: boolean;
  evidenceSource: string;
  targetArea: string;
  whyImportant: string;
  // 引导锻炼
  guidedConfig?: GuidedConfig;
  isContinuous?: boolean;
}

export interface GuidedStep {
  text: string;
  instruction: string;
  duration: number;
  beat?: boolean;
  transitionDuration?: number;
}

export interface GuidedConfig {
  cycle: GuidedStep[];
  repetitions: number;
  prepCountdown?: number;
  beatMode?: boolean;
  transitionDuration?: number;
}

export type GuidedStatus = 'idle' | 'prep' | 'transition' | 'active' | 'roundComplete' | 'done';

// 运动套餐
export interface ExercisePackage {
  id: PackageType;
  name: string;
  description: string;
  duration: number;
  exercises: { exerciseId: string }[];
  recommendedFrequency: string;
}

// 运动统计
export interface ExerciseStats {
  totalCompleted: number;
  totalMinutes: number;
  categoryCounts: Record<ExerciseCategory, number>;
  packageCounts: Record<PackageType, number>;
  streakDays: number;
  lastCompletedDate: string;
  dailyHistory: Record<string, number>; // '2024-01-15': minutes
}

// 运动记录
export interface ExerciseRecord {
  id: string;
  exerciseId: string;
  packageId?: string;
  completedAt: string; // ISO 时间
  durationSeconds: number;
}

// 身体部位疲劳反馈
export type BodyPart = 'neck' | 'shoulder' | 'back' | 'wrist' | 'eye' | 'leg';

export interface FatigueFeedback {
  timestamp: string;
  parts: BodyPart[];
}
