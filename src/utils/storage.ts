/**
 * 存储工具（localStorage + sessionStorage）
 */

const PREFIX = 'care_buddy_';

/**
 * 获取存储值
 */
export function getStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(PREFIX + key);
    if (item === null) return defaultValue;
    return JSON.parse(item) as T;
  } catch (e) {
    console.warn(`[CareBuddy] Corrupted storage data for key "${key}", resetting to default:`, e);
    try {
      localStorage.removeItem(PREFIX + key);
    } catch { /* ignore */ }
    return defaultValue;
  }
}

/**
 * 设置存储值
 */
export function setStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
}

/**
 * 删除存储值
 */
export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (e) {
    console.warn('Failed to remove from localStorage:', e);
  }
}

/**
 * 清空所有应用存储
 */
export function clearStorage(): void {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
    keys.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.warn('Failed to clear localStorage:', e);
  }
}

// 存储键名常量
export const STORAGE_KEYS = {
  TASKS: 'tasks',
  SETTINGS: 'settings',
  STATS: 'stats',
  DAILY_STATS: 'daily_stats',
  EXERCISE_STATS: 'exercise_stats',
  EXERCISE_HISTORY: 'exercise_history',
  FAVORITES: 'favorites',
  LOCALE: 'locale',
  THEME: 'theme',
  CATEGORY_EXERCISE_STATS: 'category_exercise_stats',
  PACKAGE_COMPLETE_STATS: 'package_complete_stats',
  TODAY_STATS: 'today_stats',
  DAILY_GOALS: 'daily_goals',
  CHARACTER_GENDER: 'character_gender',
} as const;
