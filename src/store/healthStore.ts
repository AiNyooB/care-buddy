/**
 * 健康提醒应用全局状态管理 (Zustand)
 */

import { create } from 'zustand';
import { format, subDays } from 'date-fns';
import { getStorage, setStorage, STORAGE_KEYS } from '../utils/storage';
import { DEFAULT_TASKS, DEFAULT_SETTINGS } from '../constants';
import type { Task, AppSettings, TaskStatus, ExerciseCategory, PackageType, AppMode, EntertainmentAppRule, DailyGoals, StatsRange } from '../types';
import { DEFAULT_DAILY_GOALS } from '../constants';
import {
  timerResetTask,
  timerPauseTask,
  timerResumeTask,
  timerResetAll,
  timerToggleTask,
} from '../services';
import { exercisePackages } from '../data/exercises';

// ============================================================================
// 状态接口
// ============================================================================

interface TaskState {
  id: string;
  status: TaskStatus;
  countdown: number; // 秒
  paused: boolean;
  snoozed: boolean;
  snoozeUntil?: number; // 时间戳
}

interface Stats {
  sitBreaks: number;
  waterCups: number;
  workMinutes: number;
  eyeCare: number;
  exercisesCompleted: number;
  packagesCompleted: number;
  totalExerciseMinutes: number;
  customBreaks: number;
}

// 按小时统计
type HourlyStats = {
  sitBreaks: number[];
  waterCups: number[];
  eyeCare: number[];
  exercises: number[];
};

const EMPTY_HOURLY: HourlyStats = {
  sitBreaks: new Array(24).fill(0),
  waterCups: new Array(24).fill(0),
  eyeCare: new Array(24).fill(0),
  exercises: new Array(24).fill(0),
};

function cloneHourly(h: HourlyStats): HourlyStats {
  return {
    sitBreaks: [...h.sitBreaks],
    waterCups: [...h.waterCups],
    eyeCare: [...h.eyeCare],
    exercises: [...h.exercises],
  };
}

interface TodayStats {
  date: string;
  sitBreaks: number;
  waterCups: number;
  workMinutes: number;
  eyeCare: number;
  exercisesCompleted: number;
  customBreaks: number;
  exerciseMinutes: number;
  packagesCompleted: number;
  categoryCounts: Record<string, number>;
  packageCounts: Record<string, number>;
  hourly: HourlyStats;
}

// 同时存在于 Stats 和 TodayStats 的字段
const TODAY_FIELDS: ReadonlySet<string> = new Set(['sitBreaks', 'waterCups', 'workMinutes', 'eyeCare', 'exercisesCompleted', 'customBreaks']);

function getLocalDate(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd');
}

// 每日统计记录
interface DailyStats {
  date: string; // YYYY-MM-DD
  exercisesCompleted: number;
  packagesCompleted: number;
  exerciseMinutes: number;
  sitBreaks: number;
  waterCups: number;
  customBreaks: number;
  workMinutes: number;
  eyeCare: number;
  hourly: HourlyStats;
}

interface LockScreen {
  active: boolean;
  taskId: string | null;
  remaining: number;
  mergedIds: string[];
  waitingConfirm: boolean;
}

interface ExercisePanel {
  active: boolean;
  packageId?: string;
  currentIndex: number;
  singleExerciseId?: string;
}

interface HealthStore {
  // 任务列表
  tasks: Task[];
  taskStates: Record<string, TaskState>;

  // 应用设置
  settings: AppSettings;

  // 统计数据
  stats: Stats;

  // 每日统计历史
  dailyStats: DailyStats[];

  // 今日统计
  todayStats: TodayStats;

  // 按类别统计的动作完成数
  categoryExerciseCounts: Record<ExerciseCategory, number>;

  // 按套餐统计的完成数
  packageCompleteCounts: Record<PackageType, number>;

  // 锁屏状态
  lockScreen: LockScreen;

  // 运动面板状态
  exercisePanel: ExercisePanel;

  // 全局暂停
  isPaused: boolean;

  // 空闲状态
  isIdle: boolean;

  // 应用模式
  appMode: AppMode;

  // 娱乐模式激活状态（场景覆盖层）
  entertainmentActive: boolean;

  // 娱乐模式统一倒计时（仅娱乐激活时有值）
  entertainmentCountdown: { remaining: number; total: number } | null;

  // ============================================================================
  // 统计页状态
  // ============================================================================
  // 用户自定义每日目标（Dashboard 健康指标区域使用）
  dailyGoals: DailyGoals;
  // 统计页时间范围（周/月）
  statsRange: StatsRange;

  // ============================================================================
  // UI 状态（跨页面切换保持）
  // ============================================================================
  rightCollapsed: boolean;
  cardPage: number;
  chartMode: 'exercise' | 'package';

  // ============================================================================
  // 任务 Actions
  // ============================================================================
  updateTask: (id: string, updates: Partial<Task>) => void;
  addTask: (task: Task) => void;
  removeTask: (id: string) => void;
  toggleTask: (id: string) => Promise<void>;
  resetTask: (id: string) => Promise<void>;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;

  // ============================================================================
  // 倒计时 Actions
  // ============================================================================
  updateCountdowns: (countdowns: Record<string, { remaining: number; snoozed: boolean; snooze_remaining: number; snooze_count: number; triggered?: boolean }>) => void;
  updateCountdown: (taskId: string, seconds: number) => void;
  updateTaskCountdown: (taskId: string, payload: { countdown: number; triggered: boolean; paused: boolean; snoozed: boolean }) => void;

  // ============================================================================
  // 设置 Actions
  // ============================================================================
  updateSettings: (updates: Partial<AppSettings>) => void;
  loadSettings: () => void;
  saveSettings: () => void;

  // ============================================================================
  // 统计 Actions
  // ============================================================================
  incrementStat: (key: keyof Stats) => void;
  incrementSitBreaks: () => void;
  incrementWaterCups: () => void;
  incrementEyeCare: () => void;
  incrementCustomBreaks: () => void;
  incrementWorkMinutes: (minutes: number) => void;
  incrementExercisesCompleted: () => void;
  incrementPackagesCompleted: () => void;
  incrementCategoryExercise: (category: ExerciseCategory) => void;
  incrementPackageCompleteCount: (pkgId: PackageType) => void;
  addExerciseMinutes: (minutes: number) => void;
  updateDailyStats: (dateOverride?: string) => void;
  getWeeklyStats: () => DailyStats[];
  getMonthlyStats: () => DailyStats[];

  // ============================================================================
  // 锁屏 Actions
  // ============================================================================
  openLockScreen: (taskId: string, remaining: number, mergedIds?: string[]) => void;
  closeLockScreen: (completed: boolean) => void;
  setLockWaitingConfirm: (waiting: boolean) => void;

  // ============================================================================
  // 运动面板 Actions
  // ============================================================================
  openExercisePanel: (packageId: string) => void;
  openSingleExercisePanel: (exerciseId: string) => void;
  advanceExercise: () => void;
  skipCurrentExercise: () => void;
  closeExercisePanel: () => void;

  // ============================================================================
  // 全局 Actions
  // ============================================================================
  setPaused: (paused: boolean) => void;
  setIdle: (idle: boolean) => void;
  setAppMode: (mode: AppMode) => void;
  setEntertainmentActive: (active: boolean) => void;
  setEntertainmentCountdown: (countdown: { remaining: number; total: number } | null) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  setCardPage: (page: number) => void;
  setChartMode: (mode: 'exercise' | 'package') => void;
  resetAllTasks: () => Promise<boolean>;
  checkDayTransition: () => void;

  // ============================================================================
  // 统计页 Actions
  // ============================================================================
  setDailyGoals: (goals: DailyGoals) => void;
  resetDailyGoals: () => void;
  setStatsRange: (range: StatsRange) => void;
}

// ============================================================================
// 初始化任务状态
// ============================================================================

function initTaskStates(tasks: Task[]): Record<string, TaskState> {
  const states: Record<string, TaskState> = {};
  tasks.forEach((task) => {
    states[task.id] = {
      id: task.id,
      status: 'idle',
      countdown: task.interval * 60,
      paused: false,
      snoozed: false,
    };
  });
  return states;
}

// 日期切换时先将旧日数据保存到 dailyStats，再重置
function finalizeOldDay(get: () => HealthStore): void {
  const state = get();
  const today = getLocalDate();
  if (state.todayStats.date !== '' && state.todayStats.date !== today) {
    state.updateDailyStats(state.todayStats.date);
  }
}

// 统一日期切换逻辑：日期变化时所有 counts 都重置为 0，避免部分重置导致数据不一致
function getTodayStatsForUpdate(state: HealthStore): TodayStats {
  const today = getLocalDate();
  if (state.todayStats.date !== today) {
    return {
      date: today,
      sitBreaks: 0,
      waterCups: 0,
      workMinutes: 0,
      eyeCare: 0,
      exercisesCompleted: 0,
      customBreaks: 0,
      exerciseMinutes: 0,
      packagesCompleted: 0,
      categoryCounts: { spine: 0, circulation: 0, metabolism: 0, vision: 0, wrist: 0 },
      packageCounts: { 'package-quick': 0, 'package-standard': 0, 'package-deep': 0 },
      hourly: cloneHourly(EMPTY_HOURLY),
    };
  }
  // 补全旧数据可能缺失的 hourly 字段
  if (!state.todayStats.hourly) {
    state.todayStats.hourly = cloneHourly(EMPTY_HOURLY);
  }
  return state.todayStats;
}

// ============================================================================
// Store 实现
// ============================================================================

export const useHealthStore = create<HealthStore>((set, get) => ({
  // --------------------------------------------------------------------------
  // 初始状态
  // --------------------------------------------------------------------------
  tasks: (() => {
    const stored = getStorage<Task[]>(STORAGE_KEYS.TASKS, []);
    const defaults = DEFAULT_TASKS as unknown as Task[];
    const storedMap = new Map(stored.map((t) => [t.id, t]));
    const merged: Task[] = [];
    for (const def of defaults) {
      merged.push(storedMap.has(def.id) ? { ...def, ...structuredClone(storedMap.get(def.id)!) } : def);
    }
    for (const s of stored) {
      if (!defaults.some((d) => d.id === s.id)) merged.push(s);
    }
    return merged;
  })(),
  taskStates: initTaskStates((() => {
    const stored = getStorage<Task[]>(STORAGE_KEYS.TASKS, []);
    const defaults = DEFAULT_TASKS as unknown as Task[];
    const storedMap = new Map(stored.map((t) => [t.id, t]));
    const merged: Task[] = [];
    for (const def of defaults) {
      merged.push(storedMap.has(def.id) ? { ...def, ...structuredClone(storedMap.get(def.id)!) } : def);
    }
    for (const s of stored) {
      if (!defaults.some((d) => d.id === s.id)) merged.push(s);
    }
    return merged;
  })()),

  settings: (() => {
    const stored = getStorage<Partial<AppSettings>>(STORAGE_KEYS.SETTINGS, {});
    return { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
  })(),

  stats: getStorage<Stats>(STORAGE_KEYS.STATS, { sitBreaks: 0, waterCups: 0, workMinutes: 0, eyeCare: 0, exercisesCompleted: 0, packagesCompleted: 0, totalExerciseMinutes: 0, customBreaks: 0 }),

  dailyStats: getStorage<DailyStats[]>(STORAGE_KEYS.DAILY_STATS, []),

  todayStats: getStorage<TodayStats>(STORAGE_KEYS.TODAY_STATS, {
    date: '',
    sitBreaks: 0,
    waterCups: 0,
    workMinutes: 0,
    eyeCare: 0,
    exercisesCompleted: 0,
    customBreaks: 0,
    exerciseMinutes: 0,
    packagesCompleted: 0,
    categoryCounts: { spine: 0, circulation: 0, metabolism: 0, vision: 0, wrist: 0 },
    packageCounts: { 'package-quick': 0, 'package-standard': 0, 'package-deep': 0 },
    hourly: cloneHourly(EMPTY_HOURLY),
  }),

  categoryExerciseCounts: getStorage<Record<ExerciseCategory, number>>(STORAGE_KEYS.CATEGORY_EXERCISE_STATS, {
    spine: 0, circulation: 0, metabolism: 0, vision: 0, wrist: 0,
  }),

  packageCompleteCounts: getStorage<Record<PackageType, number>>(STORAGE_KEYS.PACKAGE_COMPLETE_STATS, {
    'package-quick': 0,
    'package-standard': 0,
    'package-deep': 0,
  }),

  lockScreen: {
    active: false,
    taskId: null,
    remaining: 0,
    mergedIds: [],
    waitingConfirm: false,
  },

  exercisePanel: {
    active: false,
    packageId: undefined,
    currentIndex: 0,
    singleExerciseId: undefined,
  },

  isPaused: false,
  isIdle: false,
  appMode: (() => {
    const stored = getStorage<Partial<AppSettings>>(STORAGE_KEYS.SETTINGS, {});
    const raw = stored.appMode as string | undefined;
    if (raw === 'normal' || raw === 'entertainment') return 'notification' as AppMode;
    return (raw ?? DEFAULT_SETTINGS.appMode) as AppMode;
  })(),
  entertainmentActive: false,
  entertainmentCountdown: null,

  // 统计页状态
  dailyGoals: (() => {
    const stored = getStorage<Partial<DailyGoals>>(STORAGE_KEYS.DAILY_GOALS, {});
    return { ...DEFAULT_DAILY_GOALS, ...stored } as DailyGoals;
  })(),
  statsRange: 'week' as StatsRange,

  // UI 状态（跨页面切换保持）
  rightCollapsed: false,
  cardPage: 1,
  chartMode: 'exercise' as const,

  // --------------------------------------------------------------------------
  // 任务 Actions
  // --------------------------------------------------------------------------
  updateTask: (id, updates) => {
    set((state) => {
      const tasks = state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
      setStorage(STORAGE_KEYS.TASKS, tasks);
      return { tasks };
    });
  },

  addTask: (task) => {
    set((state) => {
      const tasks = [...state.tasks, task];
      const taskStates = {
        ...state.taskStates,
        [task.id]: {
          id: task.id,
          status: 'idle' as TaskStatus,
          countdown: task.interval * 60,
          paused: false,
          snoozed: false,
        },
      };
      setStorage(STORAGE_KEYS.TASKS, tasks);
      return { tasks, taskStates };
    });
  },

  removeTask: (id) => {
    set((state) => {
      const tasks = state.tasks.filter((t) => t.id !== id);
      const taskStates = { ...state.taskStates };
      delete taskStates[id];
      setStorage(STORAGE_KEYS.TASKS, tasks);
      return { tasks, taskStates };
    });
  },

  toggleTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const newEnabled = !task.enabled;
    // 乐观更新（即时反馈 Switch 态）
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, enabled: newEnabled } : t)),
    }));
    setStorage(STORAGE_KEYS.TASKS, get().tasks);
    try {
      await timerToggleTask(id, newEnabled, task.interval);
    } catch (e) {
      console.warn('[toggleTask] IPC failed:', e);
      // 回滚乐观更新
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? { ...t, enabled: !newEnabled } : t)),
      }));
      setStorage(STORAGE_KEYS.TASKS, get().tasks);
    }
  },

  resetTask: async (id) => {
    try {
      await timerResetTask(id);
    } catch (e) {
      console.warn('[resetTask] IPC failed:', e);
      // 不更新 store，等 task-reset-confirmed 事件或下一秒 countdown-update 自动纠正
    }
  },

  pauseTask: async (id) => {
    const prev = get().taskStates[id];
    const prevPaused = prev?.paused;
    const prevStatus = prev?.status;
    // 乐观更新：Switch 立即翻转，避免 0-1000ms 卡顿
    set((state) => ({
      taskStates: {
        ...state.taskStates,
        [id]: { ...state.taskStates[id], paused: true, status: 'paused' as TaskStatus },
      },
    }));
    try {
      await timerPauseTask(id);
    } catch (e) {
      console.warn('[pauseTask] IPC failed:', e);
      // 回滚
      set((state) => ({
        taskStates: {
          ...state.taskStates,
          [id]: { ...state.taskStates[id], paused: prevPaused ?? false, status: prevStatus ?? 'idle' },
        },
      }));
    }
  },

  resumeTask: async (id) => {
    const prev = get().taskStates[id];
    const prevPaused = prev?.paused;
    const prevStatus = prev?.status;
    // 乐观更新
    set((state) => ({
      taskStates: {
        ...state.taskStates,
        [id]: { ...state.taskStates[id], paused: false, status: 'idle' as TaskStatus },
      },
    }));
    try {
      await timerResumeTask(id);
    } catch (e) {
      console.warn('[resumeTask] IPC failed:', e);
      set((state) => ({
        taskStates: {
          ...state.taskStates,
          [id]: { ...state.taskStates[id], paused: prevPaused ?? false, status: prevStatus ?? 'idle' },
        },
      }));
    }
  },

  // --------------------------------------------------------------------------
  // 倒计时 Actions
  // --------------------------------------------------------------------------
  updateCountdowns: (countdowns) => {
    set((state) => {
      let changed = false;
      const taskStates = { ...state.taskStates };
      state.tasks.forEach((task) => {
        const info = countdowns[task.id];
        // 优先用后端剩余值；后端未给出（如冻结期无 emit）时保留上一帧值，避免回落到满值造成闪烁
        const countdown = info?.remaining ?? taskStates[task.id]?.countdown ?? task.interval * 60;
        const prev = taskStates[task.id];
        if (!prev || prev.countdown !== countdown || prev.snoozed !== info?.snoozed) {
          changed = true;
          // 暂停状态优先，避免 countdown <= 0 时覆盖 paused 状态
          const status: TaskStatus = prev?.status === 'paused'
            ? 'paused'
            : countdown <= 0 ? 'running' : prev?.status ?? 'idle';
          taskStates[task.id] = {
            ...prev,
            countdown,
            status,
            snoozed: info?.snoozed ?? prev?.snoozed ?? false,
          };
        }
      });
      return changed ? { taskStates } : {};
    });
  },

  updateCountdown: (taskId, seconds) => {
    set((state) => ({
      taskStates: {
        ...state.taskStates,
        [taskId]: { ...state.taskStates[taskId], countdown: seconds },
      },
    }));
  },

  // task-reset-confirmed 事件触发的单任务即时确认写入（携带完整状态字段，前端直接镜像）
  // 注：triggered 字段在 payload 中保留（后端 emit），但 TaskState 不存储（与 updateCountdowns 一致）
  updateTaskCountdown: (taskId, payload) => {
    set((state) => ({
      taskStates: {
        ...state.taskStates,
        [taskId]: {
          ...state.taskStates[taskId],
          countdown: payload.countdown,
          paused: payload.paused,
          snoozed: payload.snoozed,
          status: 'idle' as TaskStatus,
        },
      },
    }));
  },

  // --------------------------------------------------------------------------
  // 设置 Actions
  // --------------------------------------------------------------------------
  updateSettings: (updates) => {
    set((state) => {
      const settings = { ...state.settings, ...updates };
      setStorage(STORAGE_KEYS.SETTINGS, settings);
      return { settings };
    });
  },

  loadSettings: () => {
    const stored = getStorage<Partial<AppSettings>>(STORAGE_KEYS.SETTINGS, {});
    const settings = { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
    set({ settings });
  },

  saveSettings: () => {
    const { settings } = get();
    setStorage(STORAGE_KEYS.SETTINGS, settings);
  },

  // --------------------------------------------------------------------------
  // 统计 Actions
  // --------------------------------------------------------------------------
  incrementStat: (key) => {
    if (TODAY_FIELDS.has(key)) finalizeOldDay(get);
    const hour = new Date().getHours();
    set((state) => {
      const stats = { ...state.stats, [key]: state.stats[key] + 1 };
      setStorage(STORAGE_KEYS.STATS, stats);

      if (!TODAY_FIELDS.has(key)) return { stats };

      const ts = getTodayStatsForUpdate(state);
      const hourly = cloneHourly(ts.hourly);
      if (key in hourly) {
        hourly[key as keyof HourlyStats][hour] += 1;
      }
      const todayStats = { ...ts, [key]: (ts as any)[key] + 1, hourly };
      setStorage(STORAGE_KEYS.TODAY_STATS, todayStats);
      return { stats, todayStats };
    });
  },

  incrementSitBreaks: () => {
    get().incrementStat('sitBreaks');
  },

  incrementWaterCups: () => {
    get().incrementStat('waterCups');
  },

  incrementEyeCare: () => {
    get().incrementStat('eyeCare');
  },

  incrementCustomBreaks: () => {
    get().incrementStat('customBreaks');
  },

  incrementWorkMinutes: (minutes) => {
    finalizeOldDay(get);
    set((state) => {
      const stats = { ...state.stats, workMinutes: state.stats.workMinutes + minutes };
      const ts = getTodayStatsForUpdate(state);
      const todayStats = { ...ts, workMinutes: ts.workMinutes + minutes };
      setStorage(STORAGE_KEYS.STATS, stats);
      setStorage(STORAGE_KEYS.TODAY_STATS, todayStats);
      return { stats, todayStats };
    });
  },

  incrementExercisesCompleted: () => {
    finalizeOldDay(get);
    const hour = new Date().getHours();
    set((state) => {
      const stats = { ...state.stats, exercisesCompleted: state.stats.exercisesCompleted + 1 };
      const ts = getTodayStatsForUpdate(state);
      const hourly = cloneHourly(ts.hourly);
      hourly.exercises[hour] += 1;
      const todayStats = { ...ts, exercisesCompleted: ts.exercisesCompleted + 1, hourly };
      setStorage(STORAGE_KEYS.STATS, stats);
      setStorage(STORAGE_KEYS.TODAY_STATS, todayStats);
      return { stats, todayStats };
    });
  },

  incrementPackagesCompleted: () => {
    finalizeOldDay(get);
    set((state) => {
      const stats = { ...state.stats, packagesCompleted: state.stats.packagesCompleted + 1 };
      const ts = getTodayStatsForUpdate(state);
      const todayStats = { ...ts, packagesCompleted: ts.packagesCompleted + 1 };
      setStorage(STORAGE_KEYS.STATS, stats);
      setStorage(STORAGE_KEYS.TODAY_STATS, todayStats);
      return { stats, todayStats };
    });
  },

  incrementCategoryExercise: (category) => {
    finalizeOldDay(get);
    set((state) => {
      const categoryExerciseCounts = {
        ...state.categoryExerciseCounts,
        [category]: state.categoryExerciseCounts[category] + 1,
      };
      setStorage(STORAGE_KEYS.CATEGORY_EXERCISE_STATS, categoryExerciseCounts);

      const ts = getTodayStatsForUpdate(state);
      const todayStats = {
        ...ts,
        categoryCounts: { ...ts.categoryCounts, [category]: (ts.categoryCounts[category] ?? 0) + 1 },
      };
      setStorage(STORAGE_KEYS.TODAY_STATS, todayStats);
      return { categoryExerciseCounts, todayStats };
    });
  },

  incrementPackageCompleteCount: (pkgId) => {
    finalizeOldDay(get);
    set((state) => {
      const packageCompleteCounts = {
        ...state.packageCompleteCounts,
        [pkgId]: state.packageCompleteCounts[pkgId] + 1,
      };
      setStorage(STORAGE_KEYS.PACKAGE_COMPLETE_STATS, packageCompleteCounts);

      const ts = getTodayStatsForUpdate(state);
      const todayStats = {
        ...ts,
        packageCounts: { ...ts.packageCounts, [pkgId]: (ts.packageCounts[pkgId] ?? 0) + 1 },
      };
      setStorage(STORAGE_KEYS.TODAY_STATS, todayStats);
      return { packageCompleteCounts, todayStats };
    });
  },

  addExerciseMinutes: (minutes) => {
    finalizeOldDay(get);
    set((state) => {
      const stats = { ...state.stats, totalExerciseMinutes: state.stats.totalExerciseMinutes + minutes };
      const ts = getTodayStatsForUpdate(state);
      const todayStats = { ...ts, exerciseMinutes: ts.exerciseMinutes + minutes };
      setStorage(STORAGE_KEYS.STATS, stats);
      setStorage(STORAGE_KEYS.TODAY_STATS, todayStats);
      return { stats, todayStats };
    });
  },

  checkDayTransition: () => {
    const state = get();
    const today = getLocalDate();
    if (state.todayStats.date !== '' && state.todayStats.date !== today) {
      state.updateDailyStats(state.todayStats.date);
      const fresh: TodayStats = {
        date: today,
        sitBreaks: 0,
        waterCups: 0,
        workMinutes: 0,
        eyeCare: 0,
        exercisesCompleted: 0,
        customBreaks: 0,
        exerciseMinutes: 0,
        packagesCompleted: 0,
        categoryCounts: { spine: 0, circulation: 0, metabolism: 0, vision: 0, wrist: 0 },
        packageCounts: { 'package-quick': 0, 'package-standard': 0, 'package-deep': 0 },
        hourly: cloneHourly(EMPTY_HOURLY),
      };
      setStorage(STORAGE_KEYS.TODAY_STATS, fresh);
      set({ todayStats: fresh });
    }
  },

  updateDailyStats: (dateOverride?: string) => {
    const date = dateOverride ?? getLocalDate();
    set((state) => {
      const dailyStats = [...state.dailyStats];
      const index = dailyStats.findIndex((d) => d.date === date);

      const data = {
        exercisesCompleted: state.todayStats.exercisesCompleted,
        packagesCompleted: state.todayStats.packagesCompleted,
        exerciseMinutes: state.todayStats.exerciseMinutes,
        sitBreaks: state.todayStats.sitBreaks,
        waterCups: state.todayStats.waterCups,
        customBreaks: state.todayStats.customBreaks,
        workMinutes: state.todayStats.workMinutes,
        eyeCare: state.todayStats.eyeCare,
        hourly: cloneHourly(state.todayStats.hourly ?? EMPTY_HOURLY),
      };

      if (index >= 0) {
        dailyStats[index] = { ...dailyStats[index], date, ...data };
      } else {
        dailyStats.push({ date, ...data });
      }

      const recentStats = dailyStats.slice(-90);
      setStorage(STORAGE_KEYS.DAILY_STATS, recentStats);
      return { dailyStats: recentStats };
    });
  },

  getWeeklyStats: () => {
    const { dailyStats } = get();
    const weekAgoStr = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    return dailyStats.filter((d) => d.date >= weekAgoStr);
  },

  getMonthlyStats: () => {
    const { dailyStats } = get();
    const monthAgoStr = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    return dailyStats.filter((d) => d.date >= monthAgoStr);
  },

  // --------------------------------------------------------------------------
  // 统计页 Actions
  // --------------------------------------------------------------------------
  setDailyGoals: (goals) => {
    setStorage(STORAGE_KEYS.DAILY_GOALS, goals);
    set({ dailyGoals: goals });
  },

  resetDailyGoals: () => {
    setStorage(STORAGE_KEYS.DAILY_GOALS, DEFAULT_DAILY_GOALS);
    set({ dailyGoals: DEFAULT_DAILY_GOALS });
  },

  setStatsRange: (range) => {
    set({ statsRange: range });
  },

  // --------------------------------------------------------------------------
  // 锁屏 Actions
  // --------------------------------------------------------------------------
  openLockScreen: (taskId, remaining, mergedIds = []) => {
    set({
      lockScreen: {
        active: true,
        taskId,
        remaining,
        mergedIds,
        waitingConfirm: false,
      },
    });
  },

  closeLockScreen: (completed) => {
    const { lockScreen } = get();
    // guard：防止重复调用
    if (!lockScreen.active) return;
    // 统计计数由调用方（useLockScreenEvents）在 closeLockScreen 之前快照 taskId/mergedIds 后调 recordTaskCompletion
    set({
      lockScreen: {
        active: false,
        taskId: null,
        remaining: 0,
        mergedIds: [],
        waitingConfirm: false,
      },
    });
  },

  setLockWaitingConfirm: (waiting) => {
    set((state) => ({
      lockScreen: { ...state.lockScreen, waitingConfirm: waiting },
    }));
  },

  // --------------------------------------------------------------------------
  // 运动面板 Actions
  // --------------------------------------------------------------------------
  openExercisePanel: (packageId) => {
    set({
      exercisePanel: {
        active: true,
        packageId,
        currentIndex: 0,
        singleExerciseId: undefined,
      },
    });
  },

  openSingleExercisePanel: (exerciseId) => {
    set({
      exercisePanel: {
        active: true,
        packageId: undefined,
        currentIndex: 0,
        singleExerciseId: exerciseId,
      },
    });
  },

  advanceExercise: () => {
    set((state) => {
      const pkg = state.exercisePanel.packageId
        ? exercisePackages.find((p) => p.id === state.exercisePanel.packageId)
        : null;
      const total = pkg?.exercises.length ?? 0;
      const nextIndex = state.exercisePanel.currentIndex + 1;
      if (nextIndex >= total) {
        return {
          exercisePanel: { ...state.exercisePanel, active: false, currentIndex: 0 },
        };
      }
      return {
        exercisePanel: { ...state.exercisePanel, currentIndex: nextIndex },
      };
    });
  },

  skipCurrentExercise: () => {
    const { exercisePanel } = get();
    const pkg = exercisePanel.packageId
      ? exercisePackages.find((p) => p.id === exercisePanel.packageId)
      : null;
    const total = pkg?.exercises.length ?? 0;
    const isLast = exercisePanel.currentIndex + 1 >= total;
    if (isLast) {
      set({
        exercisePanel: { active: false, packageId: undefined, currentIndex: 0, singleExerciseId: undefined },
      });
    } else {
      set((state) => ({
        exercisePanel: { ...state.exercisePanel, currentIndex: state.exercisePanel.currentIndex + 1 },
      }));
    }
  },

  closeExercisePanel: () => {
    set({
      exercisePanel: { active: false, packageId: undefined, currentIndex: 0, singleExerciseId: undefined },
    });
  },

  // --------------------------------------------------------------------------
  // 全局 Actions
  // --------------------------------------------------------------------------
  setPaused: (paused) => set({ isPaused: paused }),

  setIdle: (idle) => set({ isIdle: idle }),

  setAppMode: (mode) => {
    set((state) => {
      const settings = { ...state.settings, appMode: mode };
      setStorage(STORAGE_KEYS.SETTINGS, settings);
      return { appMode: mode, settings };
    });
  },

  setEntertainmentActive: (active) => set({ entertainmentActive: active }),

  setEntertainmentCountdown: (countdown) => set({ entertainmentCountdown: countdown }),

  setRightCollapsed: (collapsed) => set({ rightCollapsed: collapsed }),

  setCardPage: (page) => set({ cardPage: page }),

  setChartMode: (mode) => set({ chartMode: mode }),

  resetAllTasks: async () => {
    try {
      await timerResetAll();
      return true;
    } catch (e) {
      console.warn('[resetAllTasks] IPC failed:', e);
      // 不更新 store，等 task-reset-confirmed 事件或下一秒 countdown-update 自动纠正
      return false;
    }
  },
}));
