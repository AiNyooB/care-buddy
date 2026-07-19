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
  dailyTime: string | null; // 'HH:MM'，仅 scheduleType='daily' 时有意义
  // 运动相关字段：该提醒专属运动清单（非空即参与锁屏运动）
  exerciseIds?: string[];
  /** 仅用于测试提醒项：调试用覆盖间隔（秒），>0 时替代 interval * 60 */
  debugIntervalSeconds?: number;
}

// 任务状态
export type TaskStatus = 'idle' | 'running' | 'paused' | 'snoozed' | 'locked';

// 应用模式
export type AppMode = 'notification' | 'lock' | 'floating';

// 浮窗显示策略（app-matched 已移除，迁移到独立娱乐模式）
export type FloatingDisplayStrategy = 'always' | 'on-trigger';

// 娱乐模式应用匹配规则
export interface EntertainmentAppRule {
  id: string;
  name: string;
  matchType: 'process' | 'title';
  pattern: string;
}

// 应用设置
export interface AppSettings {
  lockScreenExerciseEnabled: boolean;
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
  appMode: AppMode;
  floatingDisplayStrategy: FloatingDisplayStrategy;
  showRecommendation: boolean;
  entertainmentModeEnabled: boolean; // 娱乐模式总开关（场景覆盖层）
  floatingOpacity: number;
  floatingSnoozeMinutes: number;
  entertainmentOpacity: number;       // 娱乐窗口透明度（独立于 floatingOpacity）
  entertainmentSnoozeMinutes: number; // 娱乐模式延后时长（独立于 floatingSnoozeMinutes）
  entertainmentApps: EntertainmentAppRule[];
  entertainmentIdleThreshold: number; // 娱乐应用前台时的空闲阈值（分钟）
  entertainmentReminderMinutes: number; // 娱乐提醒间隔（分钟），独立节奏，不读任何任务 interval
  entertainmentExitThreshold: number; // 离开娱乐应用后宽限多久退出（分钟），对应后端 grace_seconds
  entertainmentMountRecoverySeconds: number; // 娱乐窗口 mount 补救窗口（秒），拉取 last_sent 的有效期
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

// 运动统计 - 旧 ExerciseStats 已删除，统计页直接消费 store 内的 TodayStats / DailyStats

// 目标 key - 用户可自定义的目标值
export type GoalKey = 'sitBreaks' | 'eyeCare' | 'waterCups' | 'exercises';

// 每日目标 - Dashboard 健康指标区域使用
export type DailyGoals = Record<GoalKey, number>;

// 统计页时间范围
export type StatsRange = 'week' | 'month';

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
