/**
 * 时间工具函数
 */

/**
 * 格式化时长（秒 → MM:SS 或 HH:MM:SS）
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 解析时间字符串
 */
export function parseTime(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(':').map(Number);
  return { hours: h, minutes: m };
}

/**
 * 判断当前时间是否在指定时间点附近
 */
export function isNearTime(targetTime: string, thresholdMinutes: number = 5): boolean {
  const now = new Date();
  const target = parseTime(targetTime);
  const targetDate = new Date();
  targetDate.setHours(target.hours, target.minutes, 0, 0);

  const diffMs = Math.abs(now.getTime() - targetDate.getTime());
  return diffMs <= thresholdMinutes * 60 * 1000;
}

/**
 * 获取今日日期字符串 (YYYY-MM-DD)
 */
export function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
}

/**
 * 获取相对日期字符串
 */
export function getRelativeDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
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
