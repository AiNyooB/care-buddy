/**
 * Tauri 后端通信服务
 * 封装所有 @tauri-apps/api 调用，作为前端与 Rust 后端的唯一接口
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { emit, listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import type { Task, AppSettings } from '../types';

function isTauri(): boolean {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
}

export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    console.warn(`[tauri] invoke skipped — Tauri IPC not available (cmd: ${cmd})`);
    throw new Error('Tauri IPC not available');
  }
  return tauriInvoke<T>(cmd, args);
}

export async function listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn> {
  if (!isTauri()) {
    console.warn(`[tauri] listen skipped — Tauri IPC not available (event: ${event})`);
    return () => {};
  }
  return tauriListen<T>(event, handler);
}

// ============================================================================
// 任务管理
// ============================================================================

/**
 * 同步任务列表到后端
 */
export async function syncTasks(tasks: Task[]): Promise<void> {
  const tasksForBackend = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    desc: task.desc,
    interval: task.interval,
    enabled: task.enabled,
    icon: task.icon,
    auto_reset_on_idle: task.autoResetOnIdle,
    schedule_type: task.scheduleType,
    daily_time: task.dailyTime,
    debug_interval_seconds: task.debugIntervalSeconds ?? 0,
    lock_duration: task.lockDuration,
    pre_notification_seconds: task.preNotificationSeconds,
    snooze_minutes: task.snoozeMinutes,
  }));
  await invoke('sync_tasks', { tasks: tasksForBackend });
}

/**
 * 请求通知权限
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isTauri()) {
    console.warn('[tauri] notification permission skipped — Tauri IPC not available');
    return false;
  }
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === 'granted';
  }
  return granted;
}

// ============================================================================
// 自动启动
// ============================================================================

export async function getAutoStartEnabled(): Promise<boolean> {
  if (!isTauri()) {
    console.warn('[tauri] autostart check skipped — Tauri IPC not available');
    return false;
  }
  return isEnabled();
}

export async function setAutoStart(enabled: boolean): Promise<void> {
  if (!isTauri()) {
    console.warn('[tauri] autostart set skipped — Tauri IPC not available');
    return;
  }
  if (enabled) {
    await enable();
  } else {
    await disable();
  }
}

// ============================================================================
// 窗口控制
// ============================================================================

export async function minimizeWindow(): Promise<void> {
  await invoke('minimize_main_window');
}

export async function hideWindow(): Promise<void> {
  await invoke('hide_main_window');
}

export async function showWindow(): Promise<void> {
  await invoke('show_main_window');
}

// ============================================================================
// 事件监听（前端订阅后端事件）
// ============================================================================

export type CountdownUpdateHandler = (countdowns: Record<string, number>) => void;
export type LockScreenOpenHandler = (taskId: string, remaining: number, mergedIds: string[]) => void;
export type OnIdleStatusChangedHandler = (payload: { is_idle: boolean; idle_seconds: number; threshold: number; idle_start_timestamp: number | null }) => void;
export type PauseStateUpdateHandler = (paused: boolean) => void;
export type SettingsUpdateHandler = (settings: Record<string, unknown>) => void;

// CountdownInfo from backend
interface BackendCountdownInfo {
  id: string;
  remaining: number;
}

export function onCountdownUpdate(handler: CountdownUpdateHandler): Promise<() => void> {
  return listen<BackendCountdownInfo[]>('countdown-update', (event) => {
    // Convert array to Record<string, number> format
    const countdowns: Record<string, number> = {};
    event.payload.forEach((item) => {
      countdowns[item.id] = item.remaining;
    });
    handler(countdowns);
  });
}

export function onLockScreenOpen(handler: LockScreenOpenHandler): Promise<() => void> {
  return listen<{ task_id: string; remaining: number; merged_ids: string[] }>('lock-screen-open', (event) => {
    handler(event.payload.task_id, event.payload.remaining, event.payload.merged_ids);
  });
}

export function onIdleStatusChanged(handler: OnIdleStatusChangedHandler): Promise<() => void> {
  return listen<{ is_idle: boolean; idle_seconds: number; threshold: number; idle_start_timestamp: number | null }>('idle-status-changed', (event) => {
    handler(event.payload);
  });
}

export function onPauseStateUpdate(handler: PauseStateUpdateHandler): Promise<() => void> {
  return listen<{ paused: boolean }>('pause-state-updated', (event) => {
    handler(event.payload.paused);
  });
}

export function onSettingsUpdate(handler: SettingsUpdateHandler): Promise<() => void> {
  return listen<Record<string, unknown>>('settings-updated', (event) => {
    handler(event.payload);
  });
}

// ============================================================================
// 全屏锁屏
// ============================================================================

export interface LockTaskArgs {
  title: string;
  desc: string;
  duration: number;
  icon: string;
  strictMode: boolean;
  allowStrictSnooze: boolean;
  maxSnoozeCount: number;
  snoozeMinutes: number;
  currentSnoozeCount: number;
  bgImage?: string;
  autoUnlock?: boolean;
}

export async function enterLockMode(task?: LockTaskArgs): Promise<void> {
  await invoke('enter_lock_mode', { task: task ?? null });
}

export async function exitLockMode(): Promise<void> {
  await invoke('exit_lock_mode');
}

// ============================================================================
// 锁屏操作
// ============================================================================

export async function confirmLockScreen(): Promise<void> {
  await invoke('timer_set_lock_screen_active', { active: false });
}

export async function snoozeLockScreen(taskId: string, minutes: number): Promise<void> {
  await invoke('timer_snooze_task', { taskId, minutes });
}

export async function timerSetLockScreenActive(active: boolean): Promise<void> {
  await invoke('timer_set_lock_screen_active', { active });
}

// ============================================================================
// 定时器控制
// ============================================================================

export async function pauseTimer(): Promise<void> {
  await invoke('timer_pause');
}

export async function resumeTimer(): Promise<void> {
  await invoke('timer_resume');
}

export async function isTimerPaused(): Promise<boolean> {
  return invoke('timer_is_paused');
}

export async function updatePauseMenu(paused: boolean): Promise<void> {
  await invoke('update_pause_menu', { paused });
}

export async function updateTrayLanguage(language: string): Promise<void> {
  await invoke('update_tray_language', { language });
}

export async function timerPauseTask(taskId: string): Promise<void> {
  await invoke('timer_pause_task', { taskId });
}

export async function timerResumeTask(taskId: string): Promise<void> {
  await invoke('timer_resume_task', { taskId });
}

export async function timerResetTask(taskId: string): Promise<void> {
  await invoke('timer_reset_task', { taskId });
}

export async function timerResetAll(): Promise<void> {
  await invoke('timer_reset_all');
}

export async function timerSetSystemLocked(locked: boolean): Promise<void> {
  await invoke('timer_set_system_locked', { locked });
}

export async function getCountdowns(): Promise<Record<string, number>> {
  const raw = await invoke<BackendCountdownInfo[]>('get_countdowns');
  const countdowns: Record<string, number> = {};
  raw.forEach((item) => { countdowns[item.id] = item.remaining; });
  return countdowns;
}

// ============================================================================
// 提示音
// ============================================================================

export async function playNotificationSound(_taskId: string): Promise<void> {
  await invoke('play_notification_sound');
}

// ============================================================================
// 通知
// ============================================================================

export async function showNotification(title: string, body: string): Promise<void> {
  await invoke('show_notification', { title, body });
}

// ============================================================================
// 悬浮窗控制
// ============================================================================

export async function showFloatingWindow(): Promise<void> {
  await invoke('show_floating_window');
}

export async function hideFloatingWindow(): Promise<void> {
  await invoke('hide_floating_window');
}

export async function setFloatingTaskMenuOpen(open: boolean): Promise<void> {
  await invoke('set_floating_task_menu_open', { open });
}

export async function wasStartedSilent(): Promise<boolean> {
  return invoke('was_started_silent');
}

// ============================================================================
// 事件发射（前端通知后端）
// ============================================================================

export async function emitPauseStateUpdated(paused: boolean): Promise<void> {
  await emit('pause-state-updated', { paused });
}

export async function emitSettingsUpdated(settings: Record<string, unknown>): Promise<void> {
  await emit('settings-updated', settings);
}

// ============================================================================
// 设置持久化（后端保存）
// ============================================================================

export async function setIdleThreshold(minutes: number): Promise<void> {
  const seconds = minutes * 60;
  await invoke('set_idle_threshold', { seconds });
}

export async function saveSettingsToBackend(settings: AppSettings): Promise<void> {
  await invoke('save_settings', { settings: JSON.stringify(settings) });
}

export async function loadSettingsFromBackend(): Promise<AppSettings | null> {
  try {
    const raw = await invoke<string>('load_settings');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
