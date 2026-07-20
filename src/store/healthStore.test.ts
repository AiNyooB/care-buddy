/**
 * healthStore 单元测试
 *
 * 覆盖：任务 CRUD、倒计时同步、统计累加、周/月统计聚合、日期切换、
 * 运动面板导航、锁屏、设置更新、全局/UI 状态等纯逻辑。
 *
 * 通过 vi.mock('@/services') 隔离 timer* 的 Tauri IPC 调用，
 * 仅断言 store 状态变化，不触发真实后端。
 *
 * 统计相关的 "今天" 由 new Date() 决定，因此用 vi.useFakeTimers
 * 固定系统时间，保证 checkDayTransition / getWeeklyStats / getMonthlyStats
 * 行为可预测。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHealthStore } from '@/store';
import type { DailyStats, Task } from '@/types';

// 隔离 store 对 Tauri 后端的 timer* IPC 调用
const {
  timerResetTask,
  timerPauseTask,
  timerResumeTask,
  timerResetAll,
  timerToggleTask,
} = vi.hoisted(() => ({
  timerResetTask: vi.fn(),
  timerPauseTask: vi.fn(),
  timerResumeTask: vi.fn(),
  timerResetAll: vi.fn(),
  timerToggleTask: vi.fn(),
}));

vi.mock('@/services', () => ({
  timerResetTask,
  timerPauseTask,
  timerResumeTask,
  timerResetAll,
  timerToggleTask,
}));

// 固定系统时间，使日期相关逻辑可预测（today = 2026-07-20，周一，第 10 小时）
const FAKE_NOW = new Date('2026-07-20T10:30:00');
const FAKE_HOUR = 10;

// 每个用例前恢复到初始状态并清空持久化
function resetStore() {
  localStorage.clear();
  useHealthStore.setState(useHealthStore.getInitialState(), true);
}

const getState = () => useHealthStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FAKE_NOW);
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// —— 构造 DailyStats 的辅助函数 ——
function makeDaily(date: string, totals: Partial<DailyStats> = {}): DailyStats {
  return {
    date,
    exercisesCompleted: 0,
    packagesCompleted: 0,
    exerciseMinutes: 0,
    sitBreaks: 0,
    waterCups: 0,
    customBreaks: 0,
    workMinutes: 0,
    eyeCare: 0,
    hourly: {
      sitBreaks: new Array(24).fill(0),
      waterCups: new Array(24).fill(0),
      eyeCare: new Array(24).fill(0),
      exercises: new Array(24).fill(0),
    },
    ...totals,
  };
}

describe('healthStore - 任务 CRUD', () => {
  it('初始任务来自 DEFAULT_TASKS', () => {
    const ids = getState().tasks.map((t) => t.id);
    expect(ids).toEqual(['sit', 'water', 'eye', 'test']);
  });

  it('addTask 追加新任务并初始化 taskState', () => {
    const before = getState().tasks.length;
    const newTask: Task = {
      id: 'custom',
      title: '自定义',
      desc: 'desc',
      interval: 45,
      enabled: true,
      icon: 'sit',
      autoResetOnIdle: true,
      preNotificationSeconds: 5,
      snoozeMinutes: 5,
      scheduleType: 'interval',
      dailyTime: null,
    };
    getState().addTask(newTask);
    expect(getState().tasks.length).toBe(before + 1);
    expect(getState().tasks.find((t) => t.id === 'custom')).toBeDefined();
    expect(getState().taskStates['custom'].status).toBe('idle');
    expect(getState().taskStates['custom'].countdown).toBe(45 * 60);
  });

  it('removeTask 删除任务与 taskState', () => {
    getState().removeTask('water');
    expect(getState().tasks.find((t) => t.id === 'water')).toBeUndefined();
    expect(getState().taskStates['water']).toBeUndefined();
  });

  it('updateTask 合并补丁并保留其余字段', () => {
    getState().updateTask('sit', { interval: 99, title: '改了' });
    const t = getState().tasks.find((x) => x.id === 'sit')!;
    expect(t.interval).toBe(99);
    expect(t.title).toBe('改了');
    expect(t.icon).toBe('sit');
  });

  it('toggleTask 切换 enabled 并调用 timerToggleTask(id, enabled, interval)', async () => {
    await getState().toggleTask('test'); // test 默认 enabled=false
    expect(getState().tasks.find((t) => t.id === 'test')!.enabled).toBe(true);
    expect(timerToggleTask).toHaveBeenCalledWith('test', true, 1);
  });

  it('pauseTask / resumeTask 切换 taskState.status', async () => {
    await getState().pauseTask('sit');
    expect(getState().taskStates['sit'].status).toBe('paused');
    expect(getState().taskStates['sit'].paused).toBe(true);
    expect(timerPauseTask).toHaveBeenCalledWith('sit');

    await getState().resumeTask('sit');
    expect(getState().taskStates['sit'].status).toBe('idle');
    expect(getState().taskStates['sit'].paused).toBe(false);
    expect(timerResumeTask).toHaveBeenCalledWith('sit');
  });

  it('resetTask 调用 timerResetTask', async () => {
    await getState().resetTask('sit');
    expect(timerResetTask).toHaveBeenCalledWith('sit');
  });

  it('resetAllTasks 调用 timerResetAll 并返回 true', async () => {
    const r = await getState().resetAllTasks();
    expect(timerResetAll).toHaveBeenCalled();
    expect(r).toBe(true);
  });
});

describe('healthStore - 倒计时同步', () => {
  it('updateCountdowns 按 taskId 更新 taskStates.countdown 与 status', () => {
    getState().updateCountdowns({
      sit: { remaining: 100, snoozed: false, snooze_remaining: 0, snooze_count: 0 },
      water: { remaining: 0, snoozed: false, snooze_remaining: 0, snooze_count: 0 },
    });
    // countdown>0 时沿用上一帧状态（初始 idle）
    expect(getState().taskStates['sit'].countdown).toBe(100);
    expect(getState().taskStates['sit'].status).toBe('idle');
    // countdown<=0 时状态置 running
    expect(getState().taskStates['water'].countdown).toBe(0);
    expect(getState().taskStates['water'].status).toBe('running');
  });

  it('updateCountdowns 暂停态优先于 countdown<=0', () => {
    getState().pauseTask('sit');
    getState().updateCountdowns({
      sit: { remaining: 0, snoozed: false, snooze_remaining: 0, snooze_count: 0 },
    });
    expect(getState().taskStates['sit'].status).toBe('paused');
  });

  it('updateCountdown 设置单任务剩余秒数', () => {
    getState().updateCountdown('eye', 42);
    expect(getState().taskStates['eye'].countdown).toBe(42);
  });

  it('updateTaskCountdown 镜像完整状态字段', () => {
    getState().updateTaskCountdown('sit', { countdown: 7, triggered: true, paused: false, snoozed: true });
    const ts = getState().taskStates['sit'];
    expect(ts.countdown).toBe(7);
    expect(ts.paused).toBe(false);
    expect(ts.snoozed).toBe(true);
    expect(ts.status).toBe('idle');
  });
});

describe('healthStore - 统计累加', () => {
  it('incrementSitBreaks / incrementWaterCups / incrementEyeCare 累加', () => {
    getState().incrementSitBreaks();
    getState().incrementWaterCups();
    getState().incrementEyeCare();
    expect(getState().todayStats.sitBreaks).toBe(1);
    expect(getState().todayStats.waterCups).toBe(1);
    expect(getState().todayStats.eyeCare).toBe(1);
    expect(getState().stats.sitBreaks).toBe(1);
  });

  it('incrementSitBreaks 写入 hourly 分桶（按当前小时）', () => {
    getState().incrementSitBreaks();
    expect(getState().todayStats.hourly.sitBreaks[FAKE_HOUR]).toBe(1);
  });

  it('incrementWorkMinutes 累加 workMinutes', () => {
    getState().incrementWorkMinutes(7);
    expect(getState().todayStats.workMinutes).toBe(7);
    expect(getState().stats.workMinutes).toBe(7);
  });

  it('incrementExercisesCompleted 累加并记录 hourly', () => {
    getState().incrementExercisesCompleted();
    expect(getState().todayStats.exercisesCompleted).toBe(1);
    expect(getState().stats.exercisesCompleted).toBe(1);
    expect(getState().todayStats.hourly.exercises[FAKE_HOUR]).toBe(1);
  });

  it('incrementCustomBreaks / incrementPackagesCompleted 累加', () => {
    getState().incrementCustomBreaks();
    getState().incrementPackagesCompleted();
    expect(getState().todayStats.customBreaks).toBe(1);
    expect(getState().todayStats.packagesCompleted).toBe(1);
  });

  it('incrementCategoryExercise 累加分类与今日分类统计', () => {
    getState().incrementCategoryExercise('spine');
    expect(getState().categoryExerciseCounts.spine).toBe(1);
    expect(getState().todayStats.categoryCounts.spine).toBe(1);
  });

  it('incrementPackageCompleteCount 累加套餐与今日套餐统计', () => {
    getState().incrementPackageCompleteCount('package-deep');
    expect(getState().packageCompleteCounts['package-deep']).toBe(1);
    expect(getState().todayStats.packageCounts['package-deep']).toBe(1);
  });

  it('addExerciseMinutes 累加运动时长', () => {
    getState().addExerciseMinutes(30);
    expect(getState().todayStats.exerciseMinutes).toBe(30);
    expect(getState().stats.totalExerciseMinutes).toBe(30);
  });
});

describe('healthStore - 周/月统计聚合', () => {
  it('getWeeklyStats 返回最近 7 天（含边界）的每日统计', () => {
    useHealthStore.setState({
      dailyStats: [
        makeDaily('2026-07-20', { sitBreaks: 1 }), // 今天，包含
        makeDaily('2026-07-14', { sitBreaks: 1 }), // 包含
        makeDaily('2026-07-13', { sitBreaks: 1 }), // 7 天前边界，包含
        makeDaily('2026-07-12', { sitBreaks: 100 }), // 超出，排除
      ],
    });
    const week = getState().getWeeklyStats();
    expect(week).toHaveLength(3);
    expect(week.find((d) => d.date === '2026-07-12')).toBeUndefined();
  });

  it('getMonthlyStats 返回最近 30 天的每日统计', () => {
    useHealthStore.setState({
      dailyStats: [
        makeDaily('2026-07-20', { exercisesCompleted: 2 }), // 包含
        makeDaily('2026-06-25', { exercisesCompleted: 3 }), // 包含
        makeDaily('2026-06-19', { exercisesCompleted: 50 }), // 超出，排除
        makeDaily('2026-05-01', { exercisesCompleted: 50 }), // 排除
      ],
    });
    const month = getState().getMonthlyStats();
    expect(month).toHaveLength(2);
    expect(month.find((d) => d.date === '2026-06-19')).toBeUndefined();
  });

  it('updateDailyStats 写入/更新每日历史', () => {
    getState().incrementSitBreaks(); // 让今日有数据
    getState().updateDailyStats('2026-07-20');
    const entry = getState().dailyStats.find((d) => d.date === '2026-07-20');
    expect(entry?.sitBreaks).toBe(1);
    // 再次调用应更新而非新增
    getState().incrementSitBreaks();
    getState().updateDailyStats('2026-07-20');
    expect(getState().dailyStats.filter((d) => d.date === '2026-07-20')).toHaveLength(1);
    expect(getState().dailyStats.find((d) => d.date === '2026-07-20')!.sitBreaks).toBe(2);
  });
});

describe('healthStore - 日期切换', () => {
  it('跨天：先归档旧日再重置今日统计', () => {
    useHealthStore.setState({
      todayStats: { ...getState().todayStats, date: '2026-07-19', sitBreaks: 5 },
    });
    getState().checkDayTransition();

    const st = getState();
    expect(st.todayStats.date).toBe('2026-07-20'); // 已重置为今天
    expect(st.todayStats.sitBreaks).toBe(0);
    // 旧日数据被归档进 dailyStats
    const archived = st.dailyStats.find((d) => d.date === '2026-07-19');
    expect(archived?.sitBreaks).toBe(5);
  });

  it('同日切换不归档、不改变今日统计', () => {
    useHealthStore.setState({
      todayStats: { ...getState().todayStats, date: '2026-07-20', sitBreaks: 3 },
      dailyStats: [makeDaily('2026-07-20', { sitBreaks: 3 })],
    });
    getState().checkDayTransition();
    expect(getState().dailyStats).toHaveLength(1);
    expect(getState().todayStats.sitBreaks).toBe(3);
  });
});

describe('healthStore - 运动面板导航', () => {
  it('openExercisePanel 按 package 打开并定位首个', () => {
    getState().openExercisePanel('package-quick');
    const ep = getState().exercisePanel;
    expect(ep.active).toBe(true);
    expect(ep.packageId).toBe('package-quick');
    expect(ep.currentIndex).toBe(0);
  });

  it('advanceExercise 在套餐内推进，末尾关闭面板', () => {
    getState().openExercisePanel('package-quick');
    // 反复推进直到面板关闭
    let guard = 0;
    while (getState().exercisePanel.active && guard < 50) {
      const idxBefore = getState().exercisePanel.currentIndex;
      getState().advanceExercise();
      if (getState().exercisePanel.active) {
        expect(getState().exercisePanel.currentIndex).toBe(idxBefore + 1);
      }
      guard++;
    }
    expect(getState().exercisePanel.active).toBe(false);
  });

  it('openSingleExercisePanel 设置 singleExerciseId', () => {
    getState().openSingleExercisePanel('S-01');
    const ep = getState().exercisePanel;
    expect(ep.active).toBe(true);
    expect(ep.singleExerciseId).toBe('S-01');
    expect(ep.packageId).toBeUndefined();
  });

  it('skipCurrentExercise 与 closeExercisePanel 关闭面板', () => {
    getState().openSingleExercisePanel('E-01');
    getState().skipCurrentExercise();
    expect(getState().exercisePanel.active).toBe(false);

    getState().openExercisePanel('package-standard');
    getState().closeExercisePanel();
    expect(getState().exercisePanel.active).toBe(false);
    expect(getState().exercisePanel.currentIndex).toBe(0);
  });
});

describe('healthStore - 锁屏', () => {
  it('openLockScreen 记录任务、剩余时长与合并任务', () => {
    getState().openLockScreen('sit', 60, ['eye']);
    const ls = getState().lockScreen;
    expect(ls.active).toBe(true);
    expect(ls.taskId).toBe('sit');
    expect(ls.remaining).toBe(60);
    expect(ls.mergedIds).toEqual(['eye']);
  });

  it('closeLockScreen 关闭并清空（guard 防重复）', () => {
    getState().openLockScreen('eye', 30);
    getState().closeLockScreen(true);
    expect(getState().lockScreen.active).toBe(false);
    expect(getState().lockScreen.taskId).toBeNull();
    // 再次调用不应抛错（guard：active 已 false）
    getState().closeLockScreen(true);
    expect(getState().lockScreen.active).toBe(false);
  });

  it('setLockWaitingConfirm 设置等待确认态', () => {
    getState().openLockScreen('sit', 60);
    getState().setLockWaitingConfirm(true);
    expect(getState().lockScreen.waitingConfirm).toBe(true);
  });
});

describe('healthStore - 设置与全局/UI 状态', () => {
  it('updateSettings 合并设置', () => {
    getState().updateSettings({ strictMode: true, soundEnabled: false });
    expect(getState().settings.strictMode).toBe(true);
    expect(getState().settings.soundEnabled).toBe(false);
    expect(getState().settings.autoUnlock).toBe(false); // 保留
  });

  it('setAppMode 更新模式与 settings', () => {
    getState().setAppMode('lock');
    expect(getState().appMode).toBe('lock');
    expect(getState().settings.appMode).toBe('lock');
  });

  it('setPaused / setIdle / setEntertainmentActive', () => {
    getState().setPaused(true);
    getState().setIdle(true);
    getState().setEntertainmentActive(true);
    expect(getState().isPaused).toBe(true);
    expect(getState().isIdle).toBe(true);
    expect(getState().entertainmentActive).toBe(true);
  });

  it('setEntertainmentCountdown 设置统一倒计时', () => {
    getState().setEntertainmentCountdown({ remaining: 40, total: 60 });
    expect(getState().entertainmentCountdown).toEqual({ remaining: 40, total: 60 });
    getState().setEntertainmentCountdown(null);
    expect(getState().entertainmentCountdown).toBeNull();
  });

  it('统计页状态：setDailyGoals / resetDailyGoals / setStatsRange', () => {
    getState().setDailyGoals({ sitBreaks: 9, eyeCare: 8, waterCups: 7, exercises: 6 });
    expect(getState().dailyGoals.sitBreaks).toBe(9);
    getState().resetDailyGoals();
    expect(getState().dailyGoals.sitBreaks).toBe(5); // 默认值
    getState().setStatsRange('month');
    expect(getState().statsRange).toBe('month');
  });

  it('UI 状态：setRightCollapsed / setCardPage / setChartMode', () => {
    getState().setRightCollapsed(true);
    getState().setCardPage(3);
    getState().setChartMode('package');
    expect(getState().rightCollapsed).toBe(true);
    expect(getState().cardPage).toBe(3);
    expect(getState().chartMode).toBe('package');
  });
});
