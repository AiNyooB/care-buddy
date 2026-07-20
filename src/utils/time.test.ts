/**
 * src/utils/time.ts 单元测试
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  formatDuration,
  parseTime,
  isNearTime,
  getTodayDate,
  getRelativeDate,
  minutesToSeconds,
  secondsToMinutes,
  computeStreak,
  computeGoalStreak,
  getYesterdayStats,
  type StreakDay,
} from './time';

describe('formatDuration', () => {
  it('格式化秒为 MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(5)).toBe('00:05');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(599)).toBe('09:59');
  });

  it('格式化小时为 HH:MM:SS', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3665)).toBe('1:01:05');
    expect(formatDuration(36000)).toBe('10:00:00');
  });

  // 阶段 3 已修复：负数/NaN/Infinity 返回 "00:00" 兜底
  it('负数返回 "00:00"', () => {
    expect(formatDuration(-1)).toBe('00:00');
  });

  it('NaN 返回 "00:00"', () => {
    expect(formatDuration(NaN)).toBe('00:00');
  });

  it('Infinity 返回 "00:00"', () => {
    expect(formatDuration(Infinity)).toBe('00:00');
  });
});

describe('parseTime', () => {
  it('解析合法 HH:MM', () => {
    expect(parseTime('10:30')).toEqual({ ok: true, hours: 10, minutes: 30 });
    expect(parseTime('00:00')).toEqual({ ok: true, hours: 0, minutes: 0 });
    expect(parseTime('23:59')).toEqual({ ok: true, hours: 23, minutes: 59 });
  });

  it('单段数字（仅小时）→ ok:false（缺分钟段）', () => {
    expect(parseTime('10')).toEqual({ ok: false, hours: 0, minutes: 0 });
  });

  it('非数字字符串 → ok:false', () => {
    const r = parseTime('abc');
    expect(r.ok).toBe(false);
  });

  it('空字符串 → ok:false', () => {
    const r = parseTime('');
    expect(r.ok).toBe(false);
    expect(r.hours).toBe(0);
  });

  it('越界值 → ok:false', () => {
    expect(parseTime('24:00').ok).toBe(false);
    expect(parseTime('10:60').ok).toBe(false);
    expect(parseTime('-1:30').ok).toBe(false);
  });
});

describe('isNearTime', () => {
  beforeEach(() => {
    // 固定当前时间
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T10:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('当前时间正好匹配', () => {
    expect(isNearTime('10:00', 5)).toBe(true);
  });

  it('阈值内（+3 分钟）', () => {
    expect(isNearTime('10:03', 5)).toBe(true);
  });

  it('阈值外（+10 分钟）', () => {
    expect(isNearTime('10:10', 5)).toBe(false);
  });

  it('非法时间字符串 → 显式返回 false', () => {
    // 阶段 3 修复后：parseTime 返回 ok:false，isNearTime 显式返回 false
    expect(isNearTime('abc', 5)).toBe(false);
    expect(isNearTime('', 5)).toBe(false);
    expect(isNearTime('24:00', 5)).toBe(false);
  });
});

describe('minutesToSeconds / secondsToMinutes', () => {
  it('minutesToSeconds 正常值', () => {
    expect(minutesToSeconds(0)).toBe(0);
    expect(minutesToSeconds(1)).toBe(60);
    expect(minutesToSeconds(10)).toBe(600);
  });

  it('secondsToMinutes 向下取整', () => {
    expect(secondsToMinutes(0)).toBe(0);
    expect(secondsToMinutes(59)).toBe(0);
    expect(secondsToMinutes(60)).toBe(1);
    expect(secondsToMinutes(125)).toBe(2);
  });

  it('minutesToSeconds NaN 传播', () => {
    expect(Number.isNaN(minutesToSeconds(NaN))).toBe(true);
  });

  it('secondsToMinutes NaN 传播', () => {
    expect(Number.isNaN(secondsToMinutes(NaN))).toBe(true);
  });
});

describe('getTodayDate / getRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T15:30:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('getTodayDate 返回 YYYY-MM-DD', () => {
    expect(getTodayDate()).toBe('2026-07-20');
  });

  it('getRelativeDate 返回 N 天前', () => {
    expect(getRelativeDate(0)).toBe('2026-07-20');
    expect(getRelativeDate(1)).toBe('2026-07-19');
    expect(getRelativeDate(7)).toBe('2026-07-13');
  });
});

describe('getYesterdayStats', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T10:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('找到昨天记录', () => {
    const stats: StreakDay[] = [
      { date: '2026-07-18', sitBreaks: 1, waterCups: 0, exercisesCompleted: 0, customBreaks: 0, eyeCare: 0 },
      { date: '2026-07-19', sitBreaks: 2, waterCups: 1, exercisesCompleted: 0, customBreaks: 0, eyeCare: 0 },
    ];
    const r = getYesterdayStats(stats);
    expect(r?.date).toBe('2026-07-19');
    expect(r?.sitBreaks).toBe(2);
  });

  it('昨天不存在返回 null', () => {
    const stats: StreakDay[] = [
      { date: '2026-07-18', sitBreaks: 1, waterCups: 0, exercisesCompleted: 0, customBreaks: 0, eyeCare: 0 },
    ];
    expect(getYesterdayStats(stats)).toBeNull();
  });

  it('空数组返回 null', () => {
    expect(getYesterdayStats([])).toBeNull();
  });
});

describe('computeStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T10:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('连续 3 天达标', () => {
    const stats: StreakDay[] = [
      { date: '2026-07-19', sitBreaks: 1, waterCups: 0, exercisesCompleted: 0, customBreaks: 0, eyeCare: 0 },
      { date: '2026-07-18', sitBreaks: 1, waterCups: 0, exercisesCompleted: 0, customBreaks: 0, eyeCare: 0 },
      { date: '2026-07-17', sitBreaks: 1, waterCups: 0, exercisesCompleted: 0, customBreaks: 0, eyeCare: 0 },
      { date: '2026-07-16', sitBreaks: 0, waterCups: 0, exercisesCompleted: 0, customBreaks: 0, eyeCare: 0 },
    ];
    expect(computeStreak(stats)).toBe(3);
  });

  it('昨天不达标 → 0', () => {
    const stats: StreakDay[] = [
      { date: '2026-07-19', sitBreaks: 0, waterCups: 0, exercisesCompleted: 0, customBreaks: 0, eyeCare: 0 },
      { date: '2026-07-18', sitBreaks: 5, waterCups: 0, exercisesCompleted: 0, customBreaks: 0, eyeCare: 0 },
    ];
    expect(computeStreak(stats)).toBe(0);
  });

  it('空数组返回 0', () => {
    expect(computeStreak([])).toBe(0);
  });

  it('400 天连续达标应得 400（原 365 上限已去除）', () => {
    // 构造 400 天连续达标（昨天到 400 天前）
    const stats: StreakDay[] = [];
    for (let i = 1; i <= 400; i++) {
      const d = new Date(2026, 6, 20 - i);
      stats.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        sitBreaks: 1, waterCups: 0, exercisesCompleted: 0, customBreaks: 0, eyeCare: 0,
      });
    }
    // 阶段 3 修复后：上限改为 MAX_SAFE_INTEGER，streak=400
    expect(computeStreak(stats)).toBe(400);
  });
});

describe('computeGoalStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T10:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('全部达标', () => {
    const stats: StreakDay[] = [
      { date: '2026-07-19', sitBreaks: 4, waterCups: 2, exercisesCompleted: 1, customBreaks: 0, eyeCare: 2 },
      { date: '2026-07-18', sitBreaks: 4, waterCups: 2, exercisesCompleted: 1, customBreaks: 0, eyeCare: 2 },
    ];
    expect(computeGoalStreak(stats, { sitBreaks: 4, eyeCare: 2, waterCups: 2, exercises: 1 })).toBe(2);
  });

  it('部分不达标', () => {
    const stats: StreakDay[] = [
      { date: '2026-07-19', sitBreaks: 4, waterCups: 2, exercisesCompleted: 1, customBreaks: 0, eyeCare: 1 },
      { date: '2026-07-18', sitBreaks: 4, waterCups: 2, exercisesCompleted: 1, customBreaks: 0, eyeCare: 2 },
    ];
    expect(computeGoalStreak(stats, { sitBreaks: 4, eyeCare: 2, waterCups: 2, exercises: 1 })).toBe(0);
  });

  it('0 目标视为达标', () => {
    const stats: StreakDay[] = [
      { date: '2026-07-19', sitBreaks: 0, waterCups: 0, exercisesCompleted: 0, customBreaks: 0, eyeCare: 0 },
    ];
    expect(computeGoalStreak(stats, { sitBreaks: 0, eyeCare: 0, waterCups: 0, exercises: 0 })).toBe(1);
  });
});
