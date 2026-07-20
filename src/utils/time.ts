/**
 * 时间工具函数
 */

import { format, subDays, differenceInMinutes, parse as dateParse } from 'date-fns';

/**
 * 格式化时长（秒 → MM:SS 或 HH:MM:SS）
 * 负数/NaN/Infinity 返回 "00:00" 兜底，避免 UI 显示 "NaN:NaN:NaN" 等
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const safe = Math.floor(seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export interface ParseTimeResult {
  ok: boolean;
  hours: number;
  minutes: number;
}

/**
 * 解析时间字符串
 * - 合法 'HH:MM' → { ok: true, hours, minutes }
 * - 空串/缺分/非数字/越界 → { ok: false, hours: 0, minutes: 0 }
 */
export function parseTime(time: string): ParseTimeResult {
  if (typeof time !== 'string' || time.trim() === '') return { ok: false, hours: 0, minutes: 0 };
  const parts = time.split(':').map(Number);
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) {
    return { ok: false, hours: 0, minutes: 0 };
  }
  const [h, m] = parts;
  if (h < 0 || h > 23 || m < 0 || m > 59) return { ok: false, hours: 0, minutes: 0 };
  return { ok: true, hours: h, minutes: m };
}

/**
 * 判断当前时间是否在指定时间点附近
 * 非法 targetTime 返回 false（不抛错）
 */
export function isNearTime(targetTime: string, thresholdMinutes: number = 5): boolean {
  const target = parseTime(targetTime);
  if (!target.ok) return false;
  const now = new Date();
  const targetDate = new Date();
  targetDate.setHours(target.hours, target.minutes, 0, 0);

  const diffMs = Math.abs(now.getTime() - targetDate.getTime());
  return diffMs <= thresholdMinutes * 60 * 1000;
}

/**
 * 获取今日日期字符串 (YYYY-MM-DD)
 */
export function getTodayDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * 获取相对日期字符串
 */
export function getRelativeDate(daysAgo: number): string {
  return format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');
}

/**
 * 分钟转秒
 */
export function minutesToSeconds(minutes: number): number {
  return minutes * 60;
}

/**
 * 秒转分钟（向下取整）
 */
export function secondsToMinutes(seconds: number): number {
  return Math.floor(seconds / 60);
}

export interface StreakDay {
  date: string;
  sitBreaks: number;
  waterCups: number;
  exercisesCompleted: number;
  customBreaks: number;
  eyeCare: number;
}

/**
 * 获取昨天的统计记录
 * @param dailyStats 每日统计数组
 * @returns 昨天的记录，如果不存在则返回 null
 */
export function getYesterdayStats<T extends StreakDay>(dailyStats: T[]): T | null {
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  return dailyStats.find((d) => d.date === yesterdayStr) ?? null;
}

/**
 * 计算连续达标天数（从昨天往回数，当天不算）
 * 旧逻辑：当天有任何活动即算
 *
 * 注：原 365 天上限已改为 Number.MAX_SAFE_INTEGER，支持超长历史。
 */
export function computeStreak(dailyStats: StreakDay[]): number {
  const statsMap = new Map(dailyStats.map((s) => [s.date, s]));
  let streak = 0;
  for (let i = 0; i < Number.MAX_SAFE_INTEGER; i++) {
    const dateStr = format(subDays(new Date(), i), 'yyyy-MM-dd');
    const day = statsMap.get(dateStr);
    if (day && (day.sitBreaks > 0 || day.waterCups > 0 || day.exercisesCompleted > 0 || day.customBreaks > 0 || day.eyeCare > 0)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

/**
 * 计算连续达标天数（当天 4 项全部达标才算）
 * 统计页专用，直接使用 dailyGoals
 *
 * 注：原 365 天上限已改为 Number.MAX_SAFE_INTEGER，支持超长历史。
 */
export function computeGoalStreak(
  dailyStats: StreakDay[],
  dailyGoals: { sitBreaks: number; eyeCare: number; waterCups: number; exercises: number },
): number {
  const statsMap = new Map(dailyStats.map((s) => [s.date, s]));
  let streak = 0;
  for (let i = 0; i < Number.MAX_SAFE_INTEGER; i++) {
    const dateStr = format(subDays(new Date(), i), 'yyyy-MM-dd');
    const day = statsMap.get(dateStr);
    if (!day) {
      if (i > 0) break;
      continue;
    }
    // 0 目标视为已达标（当天没有该项任务也算达标）
    const met =
      (dailyGoals.sitBreaks === 0 || day.sitBreaks >= dailyGoals.sitBreaks) &&
      (dailyGoals.eyeCare === 0 || day.eyeCare >= dailyGoals.eyeCare) &&
      (dailyGoals.waterCups === 0 || day.waterCups >= dailyGoals.waterCups) &&
      (dailyGoals.exercises === 0 || day.exercisesCompleted >= dailyGoals.exercises);
    if (met) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}
