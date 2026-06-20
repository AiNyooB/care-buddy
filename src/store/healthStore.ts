/**
 * 健康提醒应用全局状态管理 (Zustand)
 */

import { create } from 'zustand';
import { getStorage, setStorage, STORAGE_KEYS } from '../utils/storage';
import { DEFAULT_TASKS, DEFAULT_SETTINGS } from '../constants';
import type { Task, AppSettings, TaskStatus, ExerciseCategory, PackageType } from '../types';
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
}

// 同时存在于 Stats 和 TodayStats 的字段
const TODAY_FIELDS: ReadonlySet<string> = new Set(['sitBreaks', 'waterCups', 'workMinutes', 'eyeCare', 'exercisesCompleted', 'customBreaks']);

function getLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  // ============================================================================
  // 任务 Actions
  // ============================================================================
  updateTask: (id: string, updates: Partial<Task>) => void;
  addTask: (task: Task) => void;
  removeTask: (id: string) => void;
  toggleTask: (id: string) => void;
  resetTask: (id: string) => void;
  pauseTask: (id: string) => void;
  resumeTask: (id: string) => void;

  // ============================================================================
  // 倒计时 Actions
  // ============================================================================
  updateCountdowns: (countdowns: Record<string, number>) => void;
  updateCountdown: (taskId: string, seconds: number) => void;

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
  updateDailyStats: () => void;
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
  resetAllTasks: () => void;
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
    };
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
    return getStorage<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS as unknown as AppSettings);
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

  toggleTask: (id) => {
    set((state) => {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return {};
      const wasEnabled = task.enabled;
      const tasks = state.tasks.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t));
      const taskStates = { ...state.taskStates };
      if (wasEnabled) {
        // 关：清暂停/贪睡
        taskStates[id] = { ...taskStates[id], paused: false, snoozed: false };
      } else {
        // 开：重置倒计时
        taskStates[id] = {
          ...taskStates[id],
          paused: false,
          snoozed: false,
          countdown: task.interval * 60,
        };
      }
      setStorage(STORAGE_KEYS.TASKS, tasks);
      return { tasks, taskStates };
    });
  },

  resetTask: (id) => {
    set((state) => {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return {};
      const taskStates = {
        ...state.taskStates,
        [id]: {
          ...state.taskStates[id],
          countdown: task.interval * 60,
          status: 'idle' as TaskStatus,
          paused: false,
          snoozed: false,
        },
      };
      return { taskStates };
    });
  },

  pauseTask: (id) => {
    set((state) => ({
      taskStates: {
        ...state.taskStates,
        [id]: { ...state.taskStates[id], paused: true, status: 'paused' as TaskStatus },
      },
    }));
  },

  resumeTask: (id) => {
    set((state) => ({
      taskStates: {
        ...state.taskStates,
        [id]: { ...state.taskStates[id], paused: false, status: 'idle' as TaskStatus },
      },
    }));
  },

  // --------------------------------------------------------------------------
  // 倒计时 Actions
  // --------------------------------------------------------------------------
  updateCountdowns: (countdowns) => {
    set((state) => {
      let changed = false;
      const taskStates = { ...state.taskStates };
      state.tasks.forEach((task) => {
        const countdown = countdowns[task.id] ?? taskStates[task.id]?.countdown ?? task.interval * 60;
        const prev = taskStates[task.id];
        if (!prev || prev.countdown !== countdown) {
          changed = true;
          // 暂停状态优先，避免 countdown <= 0 时覆盖 paused 状态
          const status: TaskStatus = prev?.status === 'paused'
            ? 'paused'
            : countdown <= 0 ? 'running' : prev?.status ?? 'idle';
          taskStates[task.id] = {
            ...prev,
            countdown,
            status,
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
    const settings = getStorage<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS as unknown as AppSettings);
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
    set((state) => {
      const stats = { ...state.stats, [key]: state.stats[key] + 1 };
      setStorage(STORAGE_KEYS.STATS, stats);

      if (!TODAY_FIELDS.has(key)) return { stats };

      const ts = getTodayStatsForUpdate(state);
      const todayStats = { ...ts, [key]: (ts as any)[key] + 1 };
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
    set((state) => {
      const stats = { ...state.stats, exercisesCompleted: state.stats.exercisesCompleted + 1 };
      const ts = getTodayStatsForUpdate(state);
      const todayStats = { ...ts, exercisesCompleted: ts.exercisesCompleted + 1 };
      setStorage(STORAGE_KEYS.STATS, stats);
      setStorage(STORAGE_KEYS.TODAY_STATS, todayStats);
      return { stats, todayStats };
    });
  },

  incrementPackagesCompleted: () => {
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
    set((state) => {
      const stats = { ...state.stats, totalExerciseMinutes: state.stats.totalExerciseMinutes + minutes };
      const ts = getTodayStatsForUpdate(state);
      const todayStats = { ...ts, exerciseMinutes: ts.exerciseMinutes + minutes };
      setStorage(STORAGE_KEYS.STATS, stats);
      setStorage(STORAGE_KEYS.TODAY_STATS, todayStats);
      return { stats, todayStats };
    });
  },

  updateDailyStats: () => {
    const today = getLocalDate(); // 使用本地时区，避免凌晨时段写入错误日期
    set((state) => {
      const dailyStats = [...state.dailyStats];
      const todayIndex = dailyStats.findIndex((d) => d.date === today);

      // 使用 todayStats 的日增值，而非 stats 的全局累计值
      const todayData = {
        exercisesCompleted: state.todayStats.exercisesCompleted,
        packagesCompleted: state.todayStats.packagesCompleted,
        exerciseMinutes: state.todayStats.exerciseMinutes,
        sitBreaks: state.todayStats.sitBreaks,
        waterCups: state.todayStats.waterCups,
        customBreaks: state.todayStats.customBreaks,
      };

      if (todayIndex >= 0) {
        // 更新今日数据
        dailyStats[todayIndex] = {
          ...dailyStats[todayIndex],
          ...todayData,
        };
      } else {
        // 添加新日期
        dailyStats.push({
          date: today,
          ...todayData,
        });
      }

      // 只保留最近90天的数据
      const recentStats = dailyStats.slice(-90);
      setStorage(STORAGE_KEYS.DAILY_STATS, recentStats);
      return { dailyStats: recentStats };
    });
  },

  getWeeklyStats: () => {
    const { dailyStats } = get();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = getLocalDate(weekAgo);

    return dailyStats.filter((d) => d.date >= weekAgoStr);
  },

  getMonthlyStats: () => {
    const { dailyStats } = get();
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthAgoStr = getLocalDate(monthAgo);

    return dailyStats.filter((d) => d.date >= monthAgoStr);
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
    const { lockScreen, tasks } = get();
    // guard：防止重复调用导致统计重复计数
    if (!lockScreen.active) return;
    if (completed && lockScreen.taskId) {
      const allIds = [lockScreen.taskId, ...lockScreen.mergedIds];
      for (const id of allIds) {
        const task = tasks.find((t) => t.id === id);
        if (!task) continue;
        if (task.id === 'sit') get().incrementSitBreaks();
        else if (task.id === 'water') get().incrementWaterCups();
        else if (task.id === 'eye') get().incrementEyeCare();
        else get().incrementCustomBreaks();
      }
      get().updateDailyStats();
    }
    // 清理 taskId 和 mergedIds，防止第二次调用时重复计数
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

  resetAllTasks: () => {
    set((state) => {
      const taskStates: Record<string, TaskState> = {};
      state.tasks.forEach((task) => {
        taskStates[task.id] = {
          id: task.id,
          status: 'idle',
          countdown: task.interval * 60,
          paused: false,
          snoozed: false,
        };
      });
      return { taskStates, isPaused: false };
    });
  },
}));
