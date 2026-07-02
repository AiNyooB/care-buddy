/**
 * 全局常量
 */

// 默认任务配置
export const DEFAULT_TASKS = [
  {
    id: 'sit',
    title: '久坐提醒',
    desc: '该起来活动了，走动一下吧~',
    interval: 45,
    enabled: true,
    icon: 'sit' as const,
    lockDuration: 60,
    autoResetOnIdle: true,
    preNotificationSeconds: 5,
    snoozeMinutes: 5,
    scheduleType: 'interval' as const,
    dailyTime: null,
    isExerciseTask: true,
    exerciseIds: ['S-01'],
  },
  {
    id: 'water',
    title: '喝水提醒',
    desc: '该喝口水了，保持水分充足~',
    interval: 60,
    enabled: true,
    icon: 'water' as const,
    lockDuration: 30,
    autoResetOnIdle: true,
    preNotificationSeconds: 5,
    snoozeMinutes: 5,
    scheduleType: 'interval' as const,
    dailyTime: null,
  },
  {
    id: 'eye',
    title: '护眼提醒',
    desc: '让眼睛休息一下，看看远处~',
    interval: 30,
    enabled: true,
    icon: 'eye' as const,
    lockDuration: 30,
    autoResetOnIdle: true,
    preNotificationSeconds: 5,
    snoozeMinutes: 5,
    scheduleType: 'interval' as const,
    dailyTime: null,
    isExerciseTask: true,
    exerciseIds: ['E-01'],
  },
  {
    id: 'test',
    title: '测试提醒',
    desc: '快速测试锁屏效果',
    interval: 1,
    enabled: false,
    icon: 'exercise' as const,
    lockDuration: 15,
    autoResetOnIdle: false,
    preNotificationSeconds: 1,
    snoozeMinutes: 1,
    scheduleType: 'interval' as const,
    dailyTime: null,
  },
];

// 默认设置
export const DEFAULT_SETTINGS = {
  lockScreenEnabled: false,
  lockScreenExerciseEnabled: false,
  strictMode: false,
  autoUnlock: false,
  autoResetOnIdle: true,
  allowStrictSnooze: false,
  mergeThreshold: 5,
  idleThreshold: 5,
  maxSnoozeCount: 3,
  soundEnabled: true,
  autoStart: false,
  silentAutoStart: false,
  floatingWindowEnabled: true,
  floatingMode: 'next' as const,
  floatingTheme: 'blue' as const,
  theme: 'system' as const,
  locale: 'zh-CN' as const,
};

// 运动分类配置
export const CATEGORY_CONFIG = {
  spine: {
    label: '脊柱与骨骼',
    labelEn: 'Spine & Bones',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: '🦴',
  },
  circulation: {
    label: '血液循环',
    labelEn: 'Blood Circulation',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    icon: '❤️',
  },
  metabolism: {
    label: '代谢激活',
    labelEn: 'Metabolism',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: '⚡',
  },
  vision: {
    label: '视力保护',
    labelEn: 'Eye Protection',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    icon: '👁',
  },
  wrist: {
    label: '神经/腕部',
    labelEn: 'Nerve/Wrist',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    icon: '🖐',
  },
} as const;

// 证据等级配置
export const EVIDENCE_CONFIG = {
  A: {
    label: 'A级证据',
    labelEn: 'Level A',
    color: 'text-red-600',
    emoji: '🔴',
    description: '多项高质量RCT或系统综述支持',
  },
  B: {
    label: 'B级证据',
    labelEn: 'Level B',
    color: 'text-orange-600',
    emoji: '🟠',
    description: '良好临床研究支持',
  },
  C: {
    label: 'C级证据',
    labelEn: 'Level C',
    color: 'text-yellow-600',
    emoji: '🟡',
    description: '专家共识',
  },
  D: {
    label: 'D级证据',
    labelEn: 'Level D',
    color: 'text-muted-text',
    emoji: '⚪',
    description: '辅助/传统实践',
  },
} as const;

// 版本信息
export const VERSION = '1.8.0';
export const APP_NAME = 'CareBuddy';
export const APP_NAME_EN = 'CareBuddy';
