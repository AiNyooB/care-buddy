/**
 * Tauri 后端通信服务
 * 封装所有 @tauri-apps/api 调用，作为前端与 Rust 后端的唯一接口
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { emit, listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import type { Task, AppSettings, AppMode, EntertainmentAppRule } from '../types';

function isTauri(): boolean {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
}

export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    console.warn(`[tauri] invoke skipped — Tauri IPC not available (cmd: ${cmd})`);
    throw new Error('Tauri IPC not available');
  }
  return tauriInvoke<T>(cmd, args).catch((err) => {
    if (String(err).includes('callback id')) {
      console.warn(`[tauri] callback id stale, ignored (cmd: ${cmd})`);
      return undefined as T;
    }
    throw err;
  });
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
    lock_duration: task.lockDuration ?? 60,
    pre_notification_seconds: task.preNotificationSeconds,
    snooze_minutes: task.snoozeMinutes,
    exercise_ids: task.exerciseIds ?? null,
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

export type LockScreenOpenHandler = (taskId: string, remaining: number, mergedIds: string[]) => void;
export type OnIdleStatusChangedHandler = (payload: { is_idle: boolean; idle_seconds: number; threshold: number; idle_start_timestamp: number | null }) => void;
export type PauseStateUpdateHandler = (paused: boolean) => void;
export type SettingsUpdateHandler = (settings: Record<string, unknown>) => void;
export interface AppModePayload {
  mode: AppMode;
  opacity: number;
  snoozeMinutes: number;
  displayStrategy: string;
}
export type AppModeUpdateHandler = (payload: AppModePayload) => void;

// CountdownInfo from backend
export interface BackendCountdownInfo {
  id: string;
  remaining: number;
  total: number;
  enabled: boolean;
  task_paused: boolean;
  snoozed: boolean;
  snooze_remaining: number;
  snooze_count: number;
  triggered: boolean;
}

export interface EntertainmentCountdownInfo {
  remaining: number;
  total: number;
}

/** countdown-update 事件 payload：三项倒计时 + 娱乐统一倒计时 */
export interface CountdownUpdatePayload {
  tasks: BackendCountdownInfo[];
  entertainment: EntertainmentCountdownInfo | null;
}

export type CountdownUpdateHandler = (
  countdowns: Record<string, BackendCountdownInfo>,
  entertainment: EntertainmentCountdownInfo | null,
) => void;

export function onCountdownUpdate(handler: CountdownUpdateHandler): Promise<() => void> {
  return listen<CountdownUpdatePayload>('countdown-update', (event) => {
    // Convert array to Record<string, BackendCountdownInfo> format
    const countdowns: Record<string, BackendCountdownInfo> = {};
    const tasks = Array.isArray(event.payload) ? event.payload : event.payload.tasks;
    tasks.forEach((item) => {
      countdowns[item.id] = item;
    });
    // 兼容旧 payload（纯数组）：娱乐倒计时为 null
    const entertainment = Array.isArray(event.payload) ? null : event.payload.entertainment;
    handler(countdowns, entertainment);
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

export function onAppModeUpdate(handler: AppModeUpdateHandler): Promise<() => void> {
  return listen<AppModePayload>('app-mode-changed', (event) => {
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
  isExerciseMode?: boolean;
  exercisePackageId?: string;
  exerciseIds?: string[];
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

export async function timerSnoozeTask(taskId: string, minutes: number): Promise<void> {
  await invoke('timer_snooze_task', { taskId, minutes });
}

export async function timerToggleTask(taskId: string, enabled: boolean, intervalMinutes: number): Promise<void> {
  await invoke('timer_toggle_task', { taskId, enabled, intervalMinutes });
}

/**
 * 触发事件丢失自愈：请求后端对仍处于 triggered 状态的任务重新发射触发事件。
 */
export async function timerReopenTriggered(): Promise<void> {
  await invoke('timer_reopen_triggered');
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

export async function startFloatingDrag(): Promise<void> {
  await invoke('start_floating_drag');
}

/**
 * 浮窗胶囊整体弹簧伸缩（窗口 = 胶囊）。
 * 预览态传 156×40，触发态传 278×48。
 */
export async function startFloatingResize(targetWidth: number, targetHeight: number): Promise<void> {
  await invoke('start_capsule_resize', {
    windowLabel: 'capsule-window',
    targetWidth,
    targetHeight,
    isPinned: false,
  });
}

/**
 * 娱乐胶囊整体弹簧伸缩（窗口 = 胶囊）。
 * active 态传 120×40，触发态传 278×48。
 */
export async function startEntertainmentResize(targetWidth: number, targetHeight: number): Promise<void> {
  await invoke('start_capsule_resize', {
    windowLabel: 'capsule-window',
    targetWidth,
    targetHeight,
    isPinned: false,
  });
}

export async function wasStartedSilent(): Promise<boolean> {
  return invoke('was_started_silent');
}

// ============================================================================
// 应用模式
// ============================================================================

export async function setAppMode(mode: AppMode): Promise<void> {
  await invoke('set_app_mode', { mode });
}

export async function getAppMode(): Promise<AppMode> {
  return invoke('get_app_mode');
}

export async function listRunningWindows(): Promise<Array<{ title: string; process: string }>> {
  return invoke('list_running_windows');
}

// ============================================================================
// 浮窗位置持久化
// ============================================================================

export async function saveFloatingPosition(x: number, y: number): Promise<void> {
  await invoke('save_floating_position', { x, y });
}

export async function getFloatingPosition(): Promise<{ x: number; y: number } | null> {
  return invoke('get_floating_position');
}

export async function syncEntertainmentApps(apps: EntertainmentAppRule[]): Promise<void> {
  await invoke('sync_entertainment_apps', { apps });
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

export async function setEntertainmentIdleThreshold(minutes: number): Promise<void> {
  await invoke('set_entertainment_idle_threshold', { minutes });
}

export async function setEntertainmentReminder(minutes: number): Promise<void> {
  await invoke('set_entertainment_reminder', { minutes });
}

export async function setEntertainmentExitThreshold(minutes: number): Promise<void> {
  await invoke('set_entertainment_exit_threshold', { minutes });
}

/**
 * 娱乐模式 snooze：设置 snoozed_until，独立于任务 snooze。
 * 娱乐模式是独立提醒节奏（维度 B），与具体任务 interval（维度 A）无关，
 * 因此不对 sit/water/eye 调 timerSnoozeTask——那是错误地把两个维度耦合。
 */
export async function snoozeEntertainment(minutes: number): Promise<void> {
  await invoke('snooze_entertainment', { minutes });
}

export async function setEntertainmentModeEnabled(enabled: boolean): Promise<void> {
  await invoke('set_entertainment_mode_enabled', { enabled });
}



/** 娱乐模式 triggered 任务 payload（FE-1.7：强类型化 getCurrentTriggeredTask 返回值） */
export interface TriggeredTaskPayload {
  taskId: string;
  title: string;
  desc: string;
  icon: string;
  mergedIds?: string[];
}

/** 拉取当前未处理的娱乐模式 triggered 任务（娱乐窗口 mount 时补救事件丢失） */
export async function getCurrentTriggeredTask(): Promise<TriggeredTaskPayload | null> {
  return await invoke<TriggeredTaskPayload | null>('get_current_triggered_task');
}

// ============= 娱乐模式独立窗口 IPC =============

/** 拉取娱乐模式窗口配置（透明度 + 延后时长） */
export async function getEntertainmentState(): Promise<{ opacity: number; snoozeMinutes: number }> {
  return await invoke<{ opacity: number; snoozeMinutes: number }>('get_entertainment_state');
}

/** 拉取娱乐模式激活状态 */
export async function getEntertainmentActive(): Promise<boolean> {
  return await invoke<boolean>('get_entertainment_active');
}

/** 隐藏娱乐模式窗口 */
export async function hideEntertainmentWindow(): Promise<void> {
  await invoke('hide_entertainment_window_cmd');
}

/** 启动娱乐窗口原生拖拽 */
export async function startEntertainmentDrag(): Promise<void> {
  await invoke('start_entertainment_drag');
}

/** 保存娱乐窗口位置 */
export async function saveEntertainmentPosition(x: number, y: number): Promise<void> {
  await invoke('save_entertainment_position', { x, y });
}

/** 获取娱乐窗口共享胶囊锚点位置（与浮窗同锚点） */
export async function getEntertainmentPosition(): Promise<{ x: number; y: number } | null> {
  return invoke('get_entertainment_position');
}

/** 实时更新娱乐窗口透明度 */
export async function setEntertainmentOpacity(opacity: number): Promise<void> {
  await invoke('set_entertainment_opacity', { opacity });
}

/** 实时更新娱乐模式延后时长 */
export async function setEntertainmentSnoozeMinutes(minutes: number): Promise<void> {
  await invoke('set_entertainment_snooze_minutes', { minutes });
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
