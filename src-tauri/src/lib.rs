use std::fs;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::collections::{HashMap, HashSet};
use std::thread;
use chrono::{Local, Timelike};
use tauri::{
    menu::{Menu, MenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent, TrayIcon},
    Listener, Manager, WindowEvent, State, Emitter, WebviewWindowBuilder, WebviewUrl, AppHandle, WebviewWindow,
};
use tauri_plugin_notification::NotificationExt;

/// 统一封装 app.emit 并记录失败日志，避免 `let _ = app.emit(...)` 静默丢错。
/// 用法：`emit_or_warn!(app, "event-name", payload)`
macro_rules! emit_or_warn {
    ($app:expr, $event:expr, $payload:expr) => {
        if let Err(e) = $app.emit($event, $payload) {
            eprintln!("[CareBuddy] emit {} failed: {}", $event, e);
        }
    };
}
use url::form_urlencoded;

// ============= 空闲检测（Windows） =============

/// 使用 GetLastInputInfo 获取系统空闲时间（秒）
fn get_idle_seconds() -> u64 {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::System::SystemInformation::GetTickCount64;

    unsafe {
        let mut lii = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };

        if GetLastInputInfo(&mut lii).as_bool() {
            // lii.dwTime 是 u32（来自 GetTickCount），GetTickCount64 是 u64。
            // 49.7 天后 dwTime 会回绕到 0，若直接用 u64 wrapping_sub 会产生天文数字 idle。
            // 把 current_tick 也截断到 u32 与 dwTime 同源，u32 wrapping_sub 自然处理回绕。
            let current_tick32 = GetTickCount64() as u32;
            let idle_ms = current_tick32.wrapping_sub(lii.dwTime) as u64;
            idle_ms / 1000
        } else {
            0
        }
    }
}

struct TrayState(Mutex<Option<TrayIcon>>);
struct FloatingState(Mutex<bool>);

// 悬浮窗尺寸常量
// —— 方案 A：窗口尺寸写死。改内容/文案导致自然宽高超过这些值会被裁切，
//    需同步改此处常量 + 前端 startXxxResize(N) 参数（高度还要改 start_capsule_resize 内的 FLOATING_HEIGHT 引用）。
const FLOATING_HEIGHT: f64 = 48.0;
// 触发态宽 278：仅作为「前端 CAPSULE_TRIGGERED_WIDTH=278」的文档基准（start_capsule_resize 的目标宽由前端按参数传入）。
// 改触发态宽时须前后端同步；保留此常量便于 grep 对齐，故允许 dead_code。
#[allow(dead_code)]
const FLOATING_DEFAULT_WIDTH: f64 = 278.0;
const FLOATING_PREVIEW_WIDTH: f64 = 156.0;      // 胶囊 预览态宽
// —— 胶囊窗口弹簧伸缩动画（移植 NetSpeed-Dynamic start_island_animation）——
// ANIMATION_ID 做打断接续：新动画递增 ID，旧线程发现 ID 变化即退出。
static CAPSULE_ANIMATION_ID: AtomicU32 = AtomicU32::new(0);

// 顶部居中锚点：放大/缩小时窗口水平中心与顶部固定，避免漂移。
struct CapsuleAnchor {
    center_x: i32,
    origin_y: i32,
    active_id: u32,
}
static CAPSULE_ANCHOR: Mutex<Option<CapsuleAnchor>> = Mutex::new(None);

// 娱乐模式应用匹配规则
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct EntertainmentAppRule {
    pub id: String,
    pub name: String,
    #[serde(rename = "matchType")]
    pub match_type: String,
    pub pattern: String,
    /// 缓存的 lower-case pattern（去掉 .exe 后缀），加载/同步时填充，避免 is_entertainment_foreground 每秒重算
    #[serde(skip)]
    pub pattern_lc: String,
}

impl EntertainmentAppRule {
    /// 根据 pattern 字段填充 pattern_lc（lower-case + 去 .exe 后缀）
    fn fill_pattern_lc(&mut self) {
        let mut p = self.pattern.to_lowercase();
        if p.ends_with(".exe") {
            p = p.trim_end_matches(".exe").to_string();
        }
        self.pattern_lc = p;
    }
}

#[derive(Clone, serde::Serialize, Debug)]
pub struct WindowInfo {
    pub title: String,
    pub process: String,
}

#[derive(Clone, Debug, Default)]
struct AppModeInner {
    mode: String,
    opacity: u8,
    snooze_minutes: u32,
    display_strategy: String, // "always", "on-trigger"（app-matched 已移除，迁移到独立娱乐模式）
    initialized: bool, // 启动期 app mode 是否已确定；未初始化时抑制触发分发，避免早期 tick 误走通知
}

struct AppModeState(Mutex<AppModeInner>);
struct EntertainmentAppsState(Mutex<Vec<EntertainmentAppRule>>);

/// 娱乐模式独立状态（场景覆盖层）
/// 激活时接管提醒分发，禁止其他单独提醒；退出时恢复 appMode 默认行为
///
/// ## 不变量（修改本结构体前必读）
///
/// ### `last_reminder_at` — 倒计时起点（用户可见语义）
/// - **只在以下场景更新为 `Some(now)`**：
///   - 用户动作：`entertainment-task-dismissed` 监听器收到 `action="done"`
///   - 状态切换：娱乐激活（首次匹配前台应用）、`set_entertainment_reminder`（用户改间隔）
///   - 系统恢复：snooze 自然过期、`timer_reset_all`
/// - **只在以下场景更新为 `None`**：
///   - 系统打断：Win+L 锁屏、idle 进入、宽限期过期、`set_entertainment_mode_enabled(false)`
/// - **触发事件（`should_fire=true`）严禁更新此字段**：否则倒计时会从 0 跳变到 `reminder_seconds`
/// - 历史教训：PR-1 曾在此处错误重置导致「触发即重置倒计时」bug
///
/// ### `last_sent` — 已发射未 dismiss 的触发标志
/// - `Some(_)` 表示有未处理的触发事件，`should_fire` 必为 false（抑制重复 emit）
/// - 所有清理路径（reset / lock / idle / disable / snooze / done）必须置 `None`
/// - 唯一写入 `Some(_)` 的位置：`should_fire=true` 分支
///
/// ### `snoozed_until` — snooze 截止时刻
/// - `Some(_)` 期间 `should_fire` 必为 false
/// - 过期后由 timer tick 自动清空并重置 `last_reminder_at = Some(now)`、`last_sent = None`
/// - 所有非 snooze 路径的状态清理必须同时清空此字段
#[derive(Clone, Debug)]
struct EntertainmentModeInner {
    enabled: bool,                          // 娱乐模式总开关（用户是否启用自动检测）
    is_active: bool,                        // 当前是否激活（前台匹配娱乐应用或宽限期内）
    idle_threshold_seconds: u64,            // 娱乐空闲阈值，默认 1800（30 分钟）
    grace_seconds: u64,                     // 切出娱乐应用后的宽限秒数，默认 60，覆盖临时切出场景
    grace_deadline: Option<Instant>,        // 宽限期截止时间；切出娱乐应用时设置，期间 is_active 仍为 true
    last_sent: Option<LastSentEntertainment>, // 最近发射的娱乐 payload，供娱乐窗口 mount 时拉取补救
    opacity: u8,                            // 娱乐窗口透明度（0-100）
    snooze_minutes: u32,                    // 娱乐模式延后时长（分钟）
    reminder_seconds: u64,                  // 娱乐提醒间隔（秒）；独立节奏，完全不读任何任务 interval
    last_reminder_at: Option<Instant>,      // 倒计时起点（用户可见语义）：仅在 done/snooze 过期/状态切换时更新，触发事件不动
    mount_recovery_seconds: u64,            // mount 补救窗口（秒）：娱乐窗口 mount 时拉取 last_sent 的有效窗口
    snoozed_until: Option<Instant>,         // snooze 截止时刻；期间 should_fire=false，过期后自动清空并重置 last_reminder_at
}

/// 最近发射的娱乐模式 payload + 时间戳，用于娱乐窗口 mount 时拉取（修复事件丢失竞态）
#[derive(Clone, Debug)]
struct LastSentEntertainment {
    payload: serde_json::Value,  // 完整的 entertainment-task-triggered payload
    sent_at: Instant,            // 发射时间，120 秒窗口内有效
}

impl Default for EntertainmentModeInner {
    fn default() -> Self {
        Self {
            enabled: false,
            is_active: false,
            idle_threshold_seconds: 1800,
            grace_seconds: 60,                  // 默认 60 秒宽限
            grace_deadline: None,
            last_sent: None,
            opacity: 70,
            snooze_minutes: 15,
            reminder_seconds: 2700,         // 默认 45 分钟
            last_reminder_at: None,
            // mount 补救窗口：娱乐窗口首次创建时 React mount 完成前，entertainment-task-triggered
            // 事件会丢失。EntertainmentPreview mount 后调 getCurrentTriggeredTask 拉取 last_sent 自愈。
            // 正常 mount < 1 秒，WebView2 冷启动最坏 2-3 秒，10 秒是安全冗余。
            mount_recovery_seconds: 10,
            snoozed_until: None,
        }
    }
}

struct EntertainmentModeState(Mutex<EntertainmentModeInner>);

struct LockStateInner {
    windows: Vec<String>,
    args: Option<LockTaskArgs>,
}

struct LockState(Mutex<LockStateInner>);

struct PauseMenuState(Mutex<Option<MenuItem<tauri::Wry>>>);

// 语言状态管理
struct LanguageState(Mutex<String>);

// 多语言文本
fn get_tray_text(key: &str, lang: &str) -> &'static str {
    match (key, lang) {
        ("quit", "en-US") => "Quit",
        ("quit", _) => "退出",
        ("show", "en-US") => "Show Main Window",
        ("show", _) => "显示主窗口",
        ("reset", "en-US") => "Reset All Tasks",
        ("reset", _) => "重置所有任务",
        ("pause", "en-US") => "Pause",
        ("pause", _) => "暂停",
        ("resume", "en-US") => "Resume",
        ("resume", _) => "继续",
        ("tooltip", "en-US") => "CareBuddy",
        ("tooltip", _) => "CareBuddy",
        ("reset_submenu", "en-US") => "Reset Single Task",
        ("reset_submenu", _) => "重置单个任务",
        ("reset_prefix", "en-US") => "Reset: ",
        ("reset_prefix", _) => "重置: ",
        // 默认任务标题翻译
        ("task_sit", "en-US") => "Stand Up Reminder",
        ("task_sit", _) => "久坐提醒",
        ("task_water", "en-US") => "Drink Water Reminder",
        ("task_water", _) => "喝水提醒",
        ("task_eye", "en-US") => "Eye Rest Reminder",
        ("task_eye", _) => "护眼提醒",
        _ => "",
    }
}

// 获取任务显示标题（默认任务使用翻译，自定义任务使用原标题）
fn get_task_display_title<'a>(task_id: &str, original_title: &'a str, lang: &str) -> std::borrow::Cow<'a, str> {
    match task_id {
        "sit" => std::borrow::Cow::Borrowed(get_tray_text("task_sit", lang)),
        "water" => std::borrow::Cow::Borrowed(get_tray_text("task_water", lang)),
        "eye" => std::borrow::Cow::Borrowed(get_tray_text("task_eye", lang)),
        _ => std::borrow::Cow::Borrowed(original_title),
    }
}

// ============= 后端定时器系统 =============

fn default_schedule_type() -> String {
    "interval".to_string()
}

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct TaskConfig {
    pub id: String,
    pub title: String,
    pub desc: String,
    pub interval: u64,  // 分钟
    pub enabled: bool,
    pub icon: String,
    #[serde(default)]
    pub auto_reset_on_idle: bool,  // 空闲时自动重置
    #[serde(default = "default_schedule_type")]
    pub schedule_type: String,
    #[serde(default)]
    pub daily_time: Option<String>,
    #[serde(default)]
    pub debug_interval_seconds: u64,
    #[serde(default)]
    pub lock_duration: u64,
    #[serde(default)]
    pub pre_notification_seconds: u64,
    #[serde(default)]
    pub snooze_minutes: u64,
    #[serde(default)]
    pub is_exercise_task: bool,
    #[serde(default)]
    pub exercise_package_id: Option<String>,
    #[serde(default)]
    pub exercise_ids: Option<Vec<String>>,
}

#[derive(Clone, Debug)]
struct TaskTimer {
    config: TaskConfig,
    reset_time: Instant,
    triggered: bool,  // 本轮是否已触发
    disabled_at: Option<Instant>,  // 禁用时的时间点，用于计算暂停时长
    snoozed: bool, // 是否处于推迟状态
    snooze_count: u32, // 当前已推迟次数
    daily_last_trigger_key: Option<String>,
}

/// 冻结原因，标识是哪条路径触发的解冻，用于区分补偿策略
#[derive(Clone, Copy, PartialEq, Eq)]
enum FreezeReason {
    Paused,
    SystemLocked,
    LockScreenActive,
    Watchdog,
}

struct TimerState {
    tasks: HashMap<String, TaskTimer>,
    // 冻结原因（三种可重叠，但只补偿一次）
    paused: bool,
    system_locked: bool,
    lock_screen_active: bool,
    freeze_start: Option<Instant>,  // 首次进入冻结状态的时间点
    // 空闲检测相关
    idle_threshold_seconds: u64,  // 空闲阈值（秒），默认 300 秒 = 5 分钟（娱乐阈值已迁移到 EntertainmentModeInner）
    is_idle: bool,  // 当前是否处于空闲状态
    idle_start: Option<Instant>,  // 进入空闲状态的时间点
    idle_start_timestamp: Option<i64>,  // Unix 时间戳（毫秒）
    // 合并触发窗口（秒）
    merge_window_seconds: u64,
}

impl TimerState {
    fn is_frozen(&self) -> bool {
        self.paused || self.system_locked || self.lock_screen_active
    }

    /// 统一的冻结补偿函数。在所有冻结原因解除后调用，按 FreezeReason 区分补偿策略。
    /// 修复遗漏 2（snoozed 在 auto-reset 分支未清）和遗漏 3（路径 A/B 无 reset_time 守卫）。
    /// 返回被清除 triggered 态的 task id 列表，调用方据此 emit floating-task-cleared 通知浮窗。
    fn compensate_after_freeze(&mut self, freeze_start: Instant, reason: FreezeReason) -> Vec<String> {
        let mut cleared = Vec::new();
        let now = Instant::now();
        let freeze_duration = freeze_start.elapsed();

        for timer in self.tasks.values_mut() {
            // ── 路径 C/D：snoozed 跳过，triggered 全量重置 ──
            if reason == FreezeReason::LockScreenActive || reason == FreezeReason::Watchdog {
                if timer.snoozed {
                    continue;  // 沿用路径 C 语义：snoozed 任务不补偿
                }
                if timer.triggered {
                    timer.triggered = false;
                    timer.reset_time = now;
                    timer.snoozed = false;
                    timer.snooze_count = 0;
                    cleared.push(timer.config.id.clone());
                    continue;
                }
                // 守卫：冻结期间被重置过的任务不补偿（路径 C 原有逻辑）
                if timer.reset_time > freeze_start {
                    continue;
                }
                timer.reset_time += freeze_duration;
                if let Some(ref mut disabled_at) = timer.disabled_at {
                    *disabled_at += freeze_duration;
                }
                continue;
            }

            // ── 路径 B：SystemLocked ──
            if reason == FreezeReason::SystemLocked {
                if timer.config.auto_reset_on_idle {
                    timer.reset_time = now;
                    timer.triggered = false;
                    timer.snoozed = false;      // 修遗漏 2：清 snoozed
                    timer.snooze_count = 0;     // 修遗漏 2：清 snooze_count
                    if timer.disabled_at.is_some() {
                        timer.disabled_at = Some(now);
                    }
                    continue;
                }
                // 非 auto_reset：平移 + 守卫（修遗漏 3：推广守卫到路径 B）
                if timer.reset_time > freeze_start {
                    continue;
                }
                timer.reset_time += freeze_duration;
                if let Some(ref mut disabled_at) = timer.disabled_at {
                    *disabled_at += freeze_duration;
                }
                continue;
            }

            // ── 路径 A：Paused ──
            // 平移 + 守卫（修遗漏 3：推广守卫到路径 A）
            if timer.reset_time > freeze_start {
                continue;
            }
            timer.reset_time += freeze_duration;
            if let Some(ref mut disabled_at) = timer.disabled_at {
                *disabled_at += freeze_duration;
            }
        }
        cleared
    }

    fn new() -> Self {
        Self {
            tasks: HashMap::new(),
            paused: false,
            system_locked: false,
            lock_screen_active: false,
            freeze_start: None,
            idle_threshold_seconds: 300,  // 默认 5 分钟
            is_idle: false,
            idle_start: None,
            idle_start_timestamp: None,
            merge_window_seconds: 300,  // 默认 5 分钟
        }
    }
}

static TIMER_STATE: std::sync::OnceLock<Mutex<TimerState>> = std::sync::OnceLock::new();

fn get_timer_state() -> &'static Mutex<TimerState> {
    TIMER_STATE.get_or_init(|| Mutex::new(TimerState::new()))
}

fn is_daily_task(task: &TaskConfig) -> bool {
    task.schedule_type == "daily" && task.daily_time.is_some()
}

/// 计算任务的总间隔秒数（用于 reset 后确定 countdown 值）
fn compute_total_secs(timer: &TaskTimer) -> u64 {
    if timer.config.debug_interval_seconds > 0 {
        timer.config.debug_interval_seconds
    } else if is_daily_task(&timer.config) {
        24 * 60 * 60
    } else {
        // saturating_mul 防止极端 interval 配置导致 u64 溢出（溢出时返回 u64::MAX，timer 永不触发，安全降级）
        timer.config.interval.saturating_mul(60)
    }
}

fn parse_daily_time(value: &str) -> Option<(u32, u32)> {
    let trimmed = value.trim();
    let mut parts = trimmed.split(':');
    let hour = parts.next()?.parse::<u32>().ok()?;
    let minute = parts.next()?.parse::<u32>().ok()?;
    if parts.next().is_some() || hour > 23 || minute > 59 {
        return None;
    }
    Some((hour, minute))
}

fn current_daily_trigger_key(task: &TaskConfig) -> Option<String> {
    if !is_daily_task(task) {
        return None;
    }

    let value = task.daily_time.as_deref()?;
    let (hour, minute) = parse_daily_time(value)?;
    let now = Local::now();
    if now.hour() == hour && now.minute() == minute {
        Some(format!("{}:{:02}:{:02}", now.format("%Y-%m-%d"), hour, minute))
    } else {
        None
    }
}

fn daily_remaining_seconds(task: &TaskConfig) -> u64 {
    let Some(value) = task.daily_time.as_deref() else {
        return 24 * 3600; // 无时间点时返回 24h，避免退化为 interval
    };
    let Some((hour, minute)) = parse_daily_time(value) else {
        return 24 * 3600;
    };

    let now = Local::now();
    let now_secs = (now.hour() * 3600 + now.minute() * 60 + now.second()) as u64;
    let target_secs = (hour * 3600 + minute * 60) as u64;
    if target_secs >= now_secs {
        target_secs - now_secs
    } else {
        24 * 3600 - now_secs + target_secs
    }
}

fn start_session_monitor(app_handle: tauri::AppHandle) {
    use windows::Win32::System::RemoteDesktop::{
        WTSRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DispatchMessageW, GetMessageW, RegisterClassW,
        TranslateMessage, CS_HREDRAW, CS_VREDRAW, MSG, WINDOW_EX_STYLE, WNDCLASSW, WS_OVERLAPPED,
        WM_WTSSESSION_CHANGE,
    };
    use windows::Win32::Foundation::HWND;
    use windows::core::{PCWSTR, w};

    const WTS_SESSION_LOCK: u32 = 0x7;
    const WTS_SESSION_UNLOCK: u32 = 0x8;

    std::thread::spawn(move || {
        unsafe {
            let class_name = w!("CareBuddySessionMonitor");

            let wc = WNDCLASSW {
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(session_wnd_proc),
                hInstance: std::mem::zeroed(),
                lpszClassName: class_name,
                ..std::mem::zeroed()
            };

            RegisterClassW(&wc);

            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                class_name,
                PCWSTR::null(),
                WS_OVERLAPPED,
                0, 0, 0, 0,
                HWND::default(),
                None,
                None,
                None,
            ).unwrap_or(HWND::default());

            if hwnd.0.is_null() {
                eprintln!("[CareBuddy] CreateWindowExW failed, system lock/unlock events will not be detected");
            }

            if !hwnd.0.is_null() {
                let _ = WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION);

                let mut msg = MSG::default();
                while GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
                    if msg.message == WM_WTSSESSION_CHANGE {
                        let wparam = msg.wParam.0 as u32;
                        if wparam == WTS_SESSION_LOCK {
                            emit_or_warn!(app_handle, "system-locked", ());
                        } else if wparam == WTS_SESSION_UNLOCK {
                            emit_or_warn!(app_handle, "system-unlocked", ());
                        }
                    }
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
        }
    });
}

unsafe extern "system" fn session_wnd_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::DefWindowProcW;
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct LockTaskArgs {
    title: String,
    desc: String,
    duration: i32,
    icon: String,
    // Slave context
    strict_mode: bool,
    allow_strict_snooze: bool,
    max_snooze_count: u32,
    snooze_minutes: u32,
    current_snooze_count: u32,
    #[serde(default)]
    bg_image: String,
    #[serde(default)]
    auto_unlock: bool,
    #[serde(default)]
    is_exercise_mode: bool,
    #[serde(default)]
    exercise_package_id: Option<String>,
    #[serde(default)]
    exercise_ids: Option<Vec<String>>,
}

// ============= 定时器命令 =============

#[derive(Clone, serde::Serialize)]
struct CountdownInfo {
    id: String,
    remaining: u64,  // 剩余秒数
    total: u64,      // 总秒数
    enabled: bool,
    task_paused: bool,
    snoozed: bool,   // 是否推迟中
    snooze_remaining: u64, // 推迟剩余时间
    snooze_count: u32, // 当前已推迟次数
    triggered: bool, // 是否已触发（remaining==0 且尚未 reset/snooze），用于前端自愈
}

/// 娱乐模式统一倒计时（附加在 countdown-update payload 中）
#[derive(serde::Serialize, Clone)]
struct EntertainmentCountdown {
    remaining: u64,
    total: u64,
}

/// countdown-update 事件 payload：三项倒计时 + 娱乐统一倒计时
#[derive(serde::Serialize, Clone)]
struct CountdownUpdatePayload {
    tasks: Vec<CountdownInfo>,
    entertainment: Option<EntertainmentCountdown>,
}

#[derive(Clone, Debug, serde::Serialize)]
struct TaskTriggeredPayload {
    id: String,
    title: String,
    desc: String,
    icon: String,
}

// 确定性主任务排序：remaining 升序（触发时均为 0，故退化为 id 升序）后 id 升序，
// 避免 HashMap 迭代序导致锁屏"主锻炼任务"随机。正常分发与自愈路径共用。
fn sort_triggers(vec: &mut [(TaskTriggeredPayload, u64)]) {
    vec.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.id.cmp(&b.0.id)));
}

fn rebuild_tray_menu(app: &AppHandle) {
    let state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    let is_paused = state.paused;
    let mut tasks: Vec<TaskConfig> = state.tasks.values().map(|t| t.config.clone()).collect();
    tasks.sort_by(|a, b| a.id.cmp(&b.id));
    drop(state);

    // 获取当前语言
    let lang = app.state::<LanguageState>().0.lock().unwrap_or_else(|e| e.into_inner()).clone();

    let quit = MenuItem::with_id(app, "quit", get_tray_text("quit", &lang), true, None::<&str>).unwrap();
    let show = MenuItem::with_id(app, "show", get_tray_text("show", &lang), true, None::<&str>).unwrap();
    let reset_all = MenuItem::with_id(app, "reset", get_tray_text("reset", &lang), true, None::<&str>).unwrap();
    let pause_text = if is_paused { get_tray_text("resume", &lang) } else { get_tray_text("pause", &lang) };
    let pause = MenuItem::with_id(app, "pause", pause_text, true, None::<&str>).unwrap();

    let reset_prefix = get_tray_text("reset_prefix", &lang);
    let mut reset_items = Vec::new();
    for task in tasks {
        let id = format!("reset_task_{}", task.id);
        let display_title = get_task_display_title(&task.id, &task.title, &lang);
        let title = format!("{}{}", reset_prefix, display_title);
        let item = MenuItem::with_id(app, &id, &title, true, None::<&str>).unwrap();
        reset_items.push(item);
    }

    let reset_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = reset_items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
    let reset_submenu = Submenu::with_items(app, get_tray_text("reset_submenu", &lang), true, &reset_refs).unwrap();

    let menu = Menu::with_items(app, &[
        &show,
        &pause,
        &reset_all,
        &reset_submenu,
        &quit
    ]).unwrap();

    let tray_state = app.state::<TrayState>();
    let guard = tray_state.0.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(tray) = guard.as_ref() {
        let _ = tray.set_menu(Some(menu));
    }
    
    let pause_state = app.state::<PauseMenuState>();
    *pause_state.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(pause);
}

#[tauri::command]
fn sync_tasks(app: tauri::AppHandle, tasks: Vec<TaskConfig>) {
    {
        let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();

        // 保留现有任务的计时状态，只更新配置
        let mut new_tasks: HashMap<String, TaskTimer> = HashMap::new();

        for task in tasks {
            if let Some(existing) = state.tasks.get(&task.id) {
                // 任务已存在
                let interval_changed = existing.config.interval != task.interval
                    || existing.config.schedule_type != task.schedule_type
                    || existing.config.daily_time != task.daily_time
                    || existing.config.debug_interval_seconds != task.debug_interval_seconds;
                let was_disabled = !existing.config.enabled;
                let is_now_enabled = task.enabled;
                let was_enabled = existing.config.enabled;
                let is_now_disabled = !task.enabled;

                if interval_changed {
                    // interval 变了，重置计时
                    new_tasks.insert(task.id.clone(), TaskTimer {
                        config: task,
                        reset_time: now,
                        triggered: false,
                        disabled_at: None,
                        snoozed: false,
                        snooze_count: 0,
                        daily_last_trigger_key: None,
                    });
                } else if was_disabled && is_now_enabled {
                    // 从禁用变为启用：全新开始
                    new_tasks.insert(task.id.clone(), TaskTimer {
                        config: task,
                        reset_time: now,
                        triggered: false,
                        disabled_at: None,
                        snoozed: false,
                        snooze_count: 0,
                        daily_last_trigger_key: None,
                    });
                } else if was_enabled && is_now_disabled {
                    // 从启用变为禁用，记录禁用时间点
                    new_tasks.insert(task.id.clone(), TaskTimer {
                        config: task,
                        reset_time: existing.reset_time,
                        triggered: existing.triggered,
                        disabled_at: Some(now),
                        snoozed: existing.snoozed,
                        snooze_count: existing.snooze_count,
                        daily_last_trigger_key: existing.daily_last_trigger_key.clone(),
                    });
                } else {
                    // 状态没变，保留
                    new_tasks.insert(task.id.clone(), TaskTimer {
                        config: task,
                        reset_time: existing.reset_time,
                        triggered: existing.triggered,
                        disabled_at: existing.disabled_at,
                        snoozed: existing.snoozed,
                        snooze_count: existing.snooze_count,
                        daily_last_trigger_key: existing.daily_last_trigger_key.clone(),
                    });
                }
            } else {
                // 新任务
                new_tasks.insert(task.id.clone(), TaskTimer {
                    config: task.clone(),
                    reset_time: now,
                    triggered: false,
                    disabled_at: if task.enabled { None } else { Some(now) },
                    snoozed: false,
                    snooze_count: 0,
                    daily_last_trigger_key: None,
                });
            }
        }

        state.tasks = new_tasks;
    } // drop lock

    rebuild_tray_menu(&app);
}

#[tauri::command]
fn timer_pause() {
    let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    if !state.paused {
        state.paused = true;
        if state.freeze_start.is_none() {
            state.freeze_start = Some(Instant::now());
        }
    }
}

#[tauri::command]
fn timer_resume() {
    let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    if state.paused {
        state.paused = false;
        // 只有当所有冻结原因都解除后才补偿
        if !state.is_frozen() {
            if let Some(freeze_start) = state.freeze_start.take() {
                state.compensate_after_freeze(freeze_start, FreezeReason::Paused);
            }
        }
    }
}

#[tauri::command]
fn timer_is_paused() -> bool {
    get_timer_state().lock().unwrap_or_else(|e| e.into_inner()).paused
}

#[tauri::command]
fn timer_pause_task(task_id: String) {
    let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if let Some(timer) = state.tasks.get_mut(&task_id) {
        if timer.config.enabled && timer.disabled_at.is_none() {
            timer.disabled_at = Some(now);
        }
    }
}

#[tauri::command]
fn timer_resume_task(task_id: String) {
    let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if let Some(timer) = state.tasks.get_mut(&task_id) {
        if timer.config.enabled {
            if let Some(disabled_at) = timer.disabled_at {
                let disabled_duration = now.duration_since(disabled_at);
                timer.reset_time += disabled_duration;
                timer.disabled_at = None;
            }
        }
    }
}

#[tauri::command]
fn timer_reset_task(app: AppHandle, task_id: String) {
    let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    let payload = if let Some(timer) = state.tasks.get_mut(&task_id) {
        timer.reset_time = now;
        timer.triggered = false;
        timer.snoozed = false;
        timer.snooze_count = 0;
        // 重置时清除单任务暂停状态（与前端 resetTask 设 paused:false 对齐）
        timer.disabled_at = None;
        // 收集 reset 后的状态字段（携带完整状态，前端直接镜像）
        Some((
            compute_total_secs(timer),
            timer.triggered,
            timer.disabled_at.is_some(),
            timer.snoozed,
        ))
    } else {
        None
    };
    drop(state);  // 释放锁再 emit
    if let Some((countdown, triggered, paused, snoozed)) = payload {
        emit_or_warn!(app,"task-reset-confirmed", serde_json::json!({
            "task_id": task_id,
            "countdown": countdown,
            "triggered": triggered,
            "paused": paused,
            "snoozed": snoozed
        }));
    }
}

#[tauri::command]
fn timer_reset_all(app: AppHandle) {
    let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    let task_ids: Vec<String> = state.tasks.keys().cloned().collect();
    for timer in state.tasks.values_mut() {
        timer.reset_time = now;
        timer.triggered = false;
        timer.snoozed = false;
        timer.snooze_count = 0;
        // 重置时清除单任务暂停状态（与前端 resetAllTasks 设 paused:false 对齐）
        timer.disabled_at = None;
    }
    // 收集每个任务的 reset payload（携带完整状态字段）
    let payloads: Vec<(String, u64, bool, bool, bool)> = task_ids.iter()
        .filter_map(|id| state.tasks.get(id).map(|timer| {
            (
                id.clone(),
                compute_total_secs(timer),
                timer.triggered,
                timer.disabled_at.is_some(),
                timer.snoozed,
            )
        }))
        .collect();
    drop(state);  // 释放锁再 emit
    for (task_id, countdown, triggered, paused, snoozed) in payloads {
        emit_or_warn!(app,"task-reset-confirmed", serde_json::json!({
            "task_id": task_id,
            "countdown": countdown,
            "triggered": triggered,
            "paused": paused,
            "snoozed": snoozed
        }));
    }
    // 清理娱乐模式最近发射缓存 + 重置倒计时 + 清 snooze，避免重置后旧累积任务再次弹出或倒计时卡住
    if let Some(ent_state) = app.try_state::<EntertainmentModeState>() {
        let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
        guard.last_reminder_at = Some(Instant::now());
        guard.last_sent = None;
        guard.snoozed_until = None;
    }
    hide_capsule_window(&app);
    emit_or_warn!(app,"entertainment-task-cleared", serde_json::json!({ "clearAll": true }));
}

#[tauri::command]
fn timer_toggle_task(task_id: String, enabled: bool, interval_minutes: u64) {
    let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if let Some(timer) = state.tasks.get_mut(&task_id) {
        timer.config.enabled = enabled;
        if enabled {
            // 启用时重置倒计时（与前端原 toggleTask 逻辑对齐）
            timer.reset_time = now;
            timer.triggered = false;
            timer.snoozed = false;
            timer.snooze_count = 0;
            timer.disabled_at = None;
            // 同步 interval（防止 sync_tasks 未及时调用）
            timer.config.interval = interval_minutes;
        }
    }
}

#[tauri::command]
fn timer_snooze_task(task_id: String, minutes: u64) {
    let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if let Some(timer) = state.tasks.get_mut(&task_id) {
        let snooze_duration = Duration::from_secs(minutes * 60);
        timer.reset_time = now + snooze_duration;

        timer.triggered = false;
        timer.snoozed = true;
        timer.snooze_count += 1;
    }
}

#[tauri::command]
fn get_countdowns() -> Vec<CountdownInfo> {
    let state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    let frozen_now = if state.is_frozen() {
        match state.freeze_start {
            Some(t) => t,
            None => {
                // 理论不应出现：is_frozen() 触发路径都同步写入 freeze_start。
                // 加 warn 便于排查；用 now 兜底（即不补偿，倒计时静止）。
                eprintln!("[CareBuddy] Warning: is_frozen() but freeze_start=None, no compensation applied");
                now
            }
        }
    } else {
        now
    };

    state.tasks.values().map(|timer| {
        let is_daily = is_daily_task(&timer.config);
        let total_secs = if timer.config.debug_interval_seconds > 0 {
            timer.config.debug_interval_seconds
        } else if is_daily {
            24 * 60 * 60
        } else {
            timer.config.interval * 60
        };

        // 如果任务被禁用，使用禁用时间点计算 elapsed，这样时间就"冻结"了
        // 如果空闲状态，使用进入空闲的时间点冻结倒计时，防止 countdown=0 触发前端预通知
        let effective_now = if state.is_idle {
            state.idle_start.unwrap_or(now)
        } else if let Some(disabled_at) = timer.disabled_at {
            disabled_at
        } else {
            frozen_now
        };

        let remaining = if timer.snoozed {
            // snoozed 任务：remaining 是推迟剩余时间，total_secs 保持原始任务间隔
            timer.reset_time
                .checked_duration_since(effective_now)
                .map(|duration| duration.as_secs())
                .unwrap_or(0)
        } else if is_daily {
            daily_remaining_seconds(&timer.config)
        } else if timer.reset_time > effective_now {
            let wait_time = timer.reset_time.duration_since(effective_now).as_secs();
            total_secs + wait_time
        } else {
            let elapsed = effective_now.saturating_duration_since(timer.reset_time).as_secs();
            total_secs.saturating_sub(elapsed)
        };
        
        let snooze_remaining = if timer.reset_time > effective_now {
            timer.reset_time.duration_since(effective_now).as_secs()
        } else {
            0
        };

        CountdownInfo {
            id: timer.config.id.clone(),
            remaining,
            total: total_secs,
            enabled: timer.config.enabled,
            task_paused: timer.config.enabled && timer.disabled_at.is_some(),
            snoozed: timer.snoozed,
            snooze_remaining,
            snooze_count: timer.snooze_count,
            triggered: timer.triggered,
        }
    }).collect()
}

/// 事件丢失自愈：对仍处于 `triggered` 状态的任务，按当前 app mode 重新发射触发事件。
/// 后端触发事件（lock-screen-open / task-notification / floating-task-triggered）是一次性的，
/// 若前端在其重订阅窗口之前错过事件，任务会永久停在 remaining==0。本命令让前端可主动重发。
#[tauri::command]
fn timer_reopen_triggered(app: tauri::AppHandle) {
    // 启动期抑制：app mode 未初始化时不重发，避免抑制窗口内的任务提前分发；
    // 待 app mode 确定后由下一帧自愈重新接管（修复通知模式滞留 #1）。
    let initialized = if let Some(state) = app.try_state::<AppModeState>() {
        state.0.lock().unwrap_or_else(|e| e.into_inner()).initialized
    } else {
        false
    };
    if !initialized {
        return;
    }

    // 锁屏/系统锁屏期间冻结，不执行任何分发（避免娱乐窗口覆盖锁屏）
    {
        let state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
        if state.is_frozen() {
            return;
        }
    }

    // 收集仍处于 triggered 的任务，并携带其实时剩余时间，供确定性排序
    let triggered: Vec<(TaskTriggeredPayload, u64)> = {
        let state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();
        state.tasks.values()
            .filter(|t| t.triggered)
            .map(|t| {
                let remaining = if is_daily_task(&t.config) {
                    daily_remaining_seconds(&t.config)
                } else {
                    let elapsed = now.saturating_duration_since(t.reset_time).as_secs();
                    let total_secs = if t.config.debug_interval_seconds > 0 {
                        t.config.debug_interval_seconds
                    } else {
                        t.config.interval * 60
                    };
                    total_secs.saturating_sub(elapsed)
                };
                (TaskTriggeredPayload {
                    id: t.config.id.clone(),
                    title: t.config.title.clone(),
                    desc: t.config.desc.clone(),
                    icon: t.config.icon.clone(),
                }, remaining)
            })
            .collect()
    };
    if triggered.is_empty() {
        return;
    }

    let app_mode = if let Some(state) = app.try_state::<AppModeState>() {
        state.0.lock().unwrap_or_else(|e| e.into_inner()).mode.clone()
    } else {
        "notification".to_string()
    };

    // 娱乐模式激活时走独立娱乐分发，跳过 appMode 分发（与主循环一致）
    let entertainment_active = app.try_state::<EntertainmentModeState>()
        .map(|s| s.0.lock().unwrap_or_else(|e| e.into_inner()).is_active)
        .unwrap_or(false);
    if entertainment_active {
        // 娱乐模式激活时任务触发被抑制（独立节奏由主循环负责），此处直接跳过，不分发任务通知
        return;
    }

    if app_mode == "notification" {
        for (task, _) in &triggered {
            emit_or_warn!(app,"task-notification", serde_json::json!({
                "taskId": task.id,
                "title": task.title,
                "desc": task.desc,
                "icon": task.icon,
            }));
        }
        // 通知模式"自动完成"语义：重发后由后端立即重置，避免 triggered 永久滞留、
        // 主圆环卡 0（与正常分发路径一致）。
        {
            let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
            let now = Instant::now();
            for (task, _) in &triggered {
                if let Some(timer) = state.tasks.get_mut(&task.id) {
                    timer.triggered = false;
                    timer.reset_time = now;
                }
            }
        }
    } else if app_mode == "lock" {
        // 与正常分发一致的确定性排序：first = 最紧迫（remaining 升序 + id 升序）的 triggered 任务
        let mut sorted = triggered;
        sort_triggers(&mut sorted);
        let first = &sorted[0];
        let merged_ids: Vec<String> = sorted.iter().skip(1).map(|(t, _)| t.id.clone()).collect();
        emit_or_warn!(app,"lock-screen-open", serde_json::json!({
            "task_id": first.0.id,
            "remaining": 0,
            "merged_ids": merged_ids
        }));
    } else if app_mode == "floating" {
        let _ = show_capsule_window(&app);
        for (task, _) in &triggered {
            emit_or_warn!(app,"floating-task-triggered", serde_json::json!({
                "taskId": task.id,
                "title": task.title,
                "desc": task.desc,
                "icon": task.icon,
            }));
        }
    }
}

#[tauri::command]
fn timer_set_system_locked(app: tauri::AppHandle, locked: bool) {
    let now = Instant::now();
    let just_locked = {
        let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
        let just_locked = locked && !state.system_locked;
        if just_locked {
            // 刚锁屏
            state.system_locked = true;
            if state.freeze_start.is_none() {
                state.freeze_start = Some(now);
            }
        } else if !locked && state.system_locked {
            // 解锁
            state.system_locked = false;
            // 只有当所有冻结原因都解除后才补偿
            if !state.is_frozen() {
                if let Some(freeze_start) = state.freeze_start.take() {
                    state.compensate_after_freeze(freeze_start, FreezeReason::SystemLocked);
                }
            }
        }
        just_locked
    };

    // Rust-S2 修复扩展：Win+L 系统锁屏路径同样需清理娱乐状态（与 enter_lock_mode 对齐）。
    // 在 timer_state 锁外执行，避免与 EntertainmentModeState 锁形成嵌套（参考 idle 路径 L1522 注释）。
    if just_locked {
        if let Some(ent_state) = app.try_state::<EntertainmentModeState>() {
            let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
            guard.is_active = false;
            guard.grace_deadline = None;
            guard.last_reminder_at = None;
            guard.last_sent = None;
            guard.snoozed_until = None;
        }
        hide_capsule_window(&app);
        emit_or_warn!(app,"entertainment-task-cleared", serde_json::json!({ "clearAll": true }));
        emit_or_warn!(app,"entertainment-mode-changed", serde_json::json!({ "active": false }));
    }
}

#[tauri::command]
fn timer_set_lock_screen_active(app: tauri::AppHandle, active: bool) {
    let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    if active && !state.lock_screen_active {
        // 刚进入锁屏模式
        state.lock_screen_active = true;
        if state.freeze_start.is_none() {
            state.freeze_start = Some(Instant::now());
        }
    } else if !active && state.lock_screen_active {
        // 退出锁屏模式
        state.lock_screen_active = false;
        // 只有当所有冻结原因都解除后才补偿
        let cleared = if !state.is_frozen() {
            if let Some(freeze_start) = state.freeze_start.take() {
                state.compensate_after_freeze(freeze_start, FreezeReason::LockScreenActive)
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };
        drop(state);  // 释放锁后再 emit，避免持锁 IO

        // 通知浮窗清除被清零的 triggered 任务（防止浮窗卡在过期 triggered 态）
        for id in &cleared {
            emit_or_warn!(app,"floating-task-cleared", serde_json::json!({ "taskId": id }));
        }

        // Restore main window from always-on-top
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_always_on_top(false);
        }
    }
}

#[tauri::command]
fn set_idle_threshold(seconds: u64) {
    let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    state.idle_threshold_seconds = seconds;
}

#[tauri::command]
fn set_entertainment_idle_threshold(minutes: u64, app: AppHandle) {
    if let Some(ent_state) = app.try_state::<EntertainmentModeState>() {
        let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
        guard.idle_threshold_seconds = minutes * 60;
    }
}

/// 设置娱乐提醒间隔（分钟）。独立节奏，完全不读任何任务 interval。
/// 重置 last_reminder_at 让新间隔从当下重新计时。
#[tauri::command]
fn set_entertainment_reminder(minutes: u64, app: AppHandle) {
    if let Some(ent_state) = app.try_state::<EntertainmentModeState>() {
        let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
        guard.reminder_seconds = minutes.max(1) * 60;
        guard.last_reminder_at = Some(Instant::now());
    }
}

/// 设置切出娱乐应用后的宽限秒数（前端传分钟）。宽限期内 is_active 仍为 true，
/// 覆盖「临时 alt-tab 看一眼消息」被打断的场景。
#[tauri::command]
fn set_entertainment_exit_threshold(minutes: u64, app: AppHandle) {
    if let Some(ent_state) = app.try_state::<EntertainmentModeState>() {
        let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
        guard.grace_seconds = minutes.max(1) * 60;
    }
}

/// 娱乐模式 snooze：设置 snoozed_until = now + minutes*60，清 last_sent。
/// 不动 last_reminder_at（snooze 过期后由 timer tick 自动重置）。
/// 不调用 timer_snooze_task：娱乐模式是独立提醒节奏（维度 B），与具体任务 interval（维度 A）无关。
#[tauri::command]
fn snooze_entertainment(minutes: u64, app: AppHandle) {
    if let Some(ent_state) = app.try_state::<EntertainmentModeState>() {
        let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
        let mins = minutes.max(1);
        guard.snoozed_until = Some(Instant::now() + Duration::from_secs(mins * 60));
        guard.last_sent = None;
    }
}

#[tauri::command]
fn set_entertainment_mode_enabled(enabled: bool, app: AppHandle) {
    if let Some(ent_state) = app.try_state::<EntertainmentModeState>() {
        let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
        let was_active = guard.is_active;
        guard.enabled = enabled;
        if !enabled {
            // 关闭娱乐模式：立即清除激活态与最近发射缓存 + snooze
            guard.is_active = false;
            guard.last_sent = None;
            guard.grace_deadline = None;
            guard.snoozed_until = None;
        }
        // 状态变化时 emit 事件，前端实时同步 entertainmentActive
        if was_active {
            emit_or_warn!(app,"entertainment-mode-changed", serde_json::json!({ "active": false }));
        }
    }
    // 关闭开关时隐藏娱乐窗口 + 通知娱乐窗口清除 React 触发态
    if !enabled {
        emit_or_warn!(app,"entertainment-task-cleared", serde_json::json!({ "clearAll": true }));
        hide_capsule_window(&app);
    }
}

#[tauri::command]
fn get_idle_threshold() -> u64 {
    let state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
    state.idle_threshold_seconds
}

#[derive(Clone, serde::Serialize)]
struct IdleStatus {
    is_idle: bool,
    idle_seconds: u64,
    threshold: u64,
    idle_start_timestamp: Option<i64>,  // 空闲开始时间戳
}

fn start_timer_thread(app_handle: AppHandle) {
    thread::spawn(move || {
        let base_interval = Duration::from_secs(1);

        // 调试日志：记录上一次的 remaining，仅在有变化时打印
        let mut prev_remaining: std::collections::HashMap<String, u64> = std::collections::HashMap::new();

        loop {
            thread::sleep(base_interval);

            // 锁屏状态看门狗：先检测外部关闭 → 再覆盖率自愈
            // ⚠️ 必须外部关闭检测先跑，否则 Alt+F4 只关了一个窗口后覆盖率自愈会重建
            {
                let is_locked_wd = get_timer_state().lock().unwrap_or_else(|e| e.into_inner()).lock_screen_active;
                if is_locked_wd {
                    let lock_state = app_handle.state::<LockState>();
                    let guard = lock_state.0.lock().unwrap_or_else(|e| e.into_inner());
                    let windows = guard.windows.clone();
                    let all_gone = windows.iter().all(|label| {
                        app_handle.get_webview_window(label).is_none()
                    });
                    if all_gone && !windows.is_empty() {
                        drop(guard);
                        eprintln!("[CareBuddy] Lock screen windows were externally closed, resetting state");
                        let mut timer_state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
                        timer_state.lock_screen_active = false;
                        let cleared = if !timer_state.is_frozen() {
                            if let Some(freeze_start) = timer_state.freeze_start.take() {
                                timer_state.compensate_after_freeze(freeze_start, FreezeReason::Watchdog)
                            } else {
                                Vec::new()
                            }
                        } else {
                            Vec::new()
                        };
                        drop(timer_state);
                        if let Some(main) = app_handle.get_webview_window("main") {
                            let _ = main.set_always_on_top(false);
                        }
                        // 通知前端清除 lockScreen.active 和 lockScreenCreating ref
                        emit_or_warn!(app_handle, "lock-screen-completed", serde_json::json!({ "completed": false }));
                        // 通知浮窗清除被清零的 triggered 任务
                        for id in &cleared {
                            emit_or_warn!(app_handle, "floating-task-cleared", serde_json::json!({ "taskId": id }));
                        }
                        // 清理 LockState.windows 和 args（与 exit_lock_mode 对齐，防止 Vec 无界增长）
                        {
                            let lock_state = app_handle.state::<LockState>();
                            let mut state_guard = lock_state.0.lock().unwrap_or_else(|e| e.into_inner());
                            state_guard.windows.clear();
                            state_guard.args = None;
                        }
                    }
                }
            }

            // 锁屏状态覆盖率自愈（仅当 lock_screen_active 仍为 true 时运行，外部关闭后已置 false 则不执行）
            let is_locked = get_timer_state().lock().unwrap_or_else(|e| e.into_inner()).lock_screen_active;
            if is_locked {
                let lock_state = app_handle.state::<LockState>();
                let mut guard = lock_state.0.lock().unwrap_or_else(|e| e.into_inner());
                let windows = guard.windows.clone();
                let args = guard.args.clone();

                for label in &windows {
                    if let Some(window) = app_handle.get_webview_window(label) {
                        if !window.is_visible().unwrap_or(false) { let _ = window.show(); }
                        if !window.is_focused().unwrap_or(false) { let _ = window.set_focus(); }
                        let _ = window.set_always_on_top(true);
                    }
                }

                if let Ok(monitors) = app_handle.available_monitors() {
                    let mut covered_indices = HashSet::new();

                    if let Some(main_win) = app_handle.get_webview_window("main") {
                        if let Ok(pos) = main_win.outer_position() {
                            for (i, m) in monitors.iter().enumerate() {
                                if m.position().x == pos.x && m.position().y == pos.y {
                                    covered_indices.insert(i);
                                    break;
                                }
                            }
                        }
                    }

                    for label in &windows {
                        if let Some(slave) = app_handle.get_webview_window(label) {
                            if let Ok(pos) = slave.outer_position() {
                                for (i, m) in monitors.iter().enumerate() {
                                    if m.position().x == pos.x && m.position().y == pos.y {
                                        covered_indices.insert(i);
                                    }
                                }
                            }
                        }
                    }

                    let primary_monitor = app_handle.primary_monitor().ok().flatten();
                    for (i, m) in monitors.iter().enumerate() {
                        if !covered_indices.contains(&i) {
                            let label = format!("lock-slave-{}", i);
                            if let Some(win) = app_handle.get_webview_window(&label) {
                                let _ = win.set_position(*m.position());
                                let _ = win.set_size(tauri::Size::Physical(*m.size()));
                                let _ = win.set_fullscreen(true);
                            } else if args.is_some() {
                                let is_primary = primary_monitor
                                    .as_ref()
                                    .map(|p| p.position() == m.position())
                                    .unwrap_or(i == 0);
                                if let Some(new_label) = create_slave_window(&app_handle, m, args.as_ref(), i, is_primary) {
                                    guard.windows.push(new_label);
                                }
                            }
                        }
                    }
                }
            }

            let mut tasks_to_trigger: Vec<(TaskTriggeredPayload, u64)> = Vec::new();
            let mut merged_near_ids: Vec<String> = Vec::new();
            let mut idle_status_changed = false;
            let mut idle_entered = false;  // 标志：刚进入空闲，用于锁外清理娱乐状态
            let current_idle_status;
            

            {
                let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());

                // 如果处于冻结状态（暂停、系统锁屏或锁屏模式激活），跳过检查
                if state.is_frozen() {
                    continue;
                }

                let now = Instant::now();
                let idle_seconds = get_idle_seconds();
                // 娱乐模式激活时使用更高的空闲阈值，避免看剧/游戏时误触发空闲冻结。
                // 设计意图：用户在娱乐模式下（看剧、打游戏）大多只是键盘鼠标不动，但人还在看屏幕，
                // 使用普通空闲阈值（5分钟）会频繁误判为空闲→暂停任务，频繁打扰。所以娱乐模式有独立
                // 空闲阈值（默认30分钟，可在设置页调整），由 set_entertainment_idle_threshold 控制。
                // 注意：这会使「离开电脑时空闲检测延迟30分钟」，是此设计的正常代价。
                let (entertainment_active, entertainment_threshold) = app_handle
                    .try_state::<EntertainmentModeState>()
                    .map(|s| {
                        let g = s.0.lock().unwrap_or_else(|e| e.into_inner());
                        (g.is_active, g.idle_threshold_seconds)
                    })
                    .unwrap_or((false, 1800));
                let threshold = if entertainment_active {
                    entertainment_threshold
                } else {
                    state.idle_threshold_seconds
                };
                let was_idle = state.is_idle;
                let is_now_idle = idle_seconds >= threshold;

                // 检测空闲状态变化
                if is_now_idle && !was_idle {
                    // 刚进入空闲状态（用户离开电脑）
                    state.is_idle = true;
                    state.idle_start = Some(now);
                    let timestamp = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as i64;
                    state.idle_start_timestamp = Some(timestamp);
                    idle_status_changed = true;
                    idle_entered = true;

                    // 1) 勾选了「空闲重置」的任务：空闲时直接重启倒计时（原有行为，不变）
                    // 2) 「离开即重置」（产品决策，见下方说明）：用户一离开，任何仍处于
                    //    triggered 状态的任务都必须解除触发态，而不是把提醒挂起、等用户回来
                    //    手动处理。
                    //
                    //    不这样做的后果（已复现的 bug）：久坐触发 → 进入闲置 → 恢复倒计时后，
                    //    浮窗胶囊会卡在触发态。根因是闲置期间只隐藏了 OS 窗口、未清 FloatingPreview
                    //    的 React 状态，且 FloatingPreview 对 `floating-preview-update` 有
                    //    `phase==='triggered'` 守卫拦截，触发态永远切不回预览态（即使后端仍报
                    //    triggered==true，自愈也无法把 live 倒计时送进去）。
                    //
                    //    这里把 triggered 清掉并重置计时，使浮窗在窗口重新出现时回到预览态。
                    //    仅清 triggered 而不重置 reset_time 会导致恢复瞬间 remaining 仍为 0 而
                    //    立即重新触发，所以必须一并 `reset_time = now`（闲置期间 effective_now
                    //    锁定在 idle_start，剩余时间冻结为满值）。
                    //
                    // 合并 1)+2) 为单次遍历：auto_reset_on_idle 任务先重置；否则若 triggered 也重置。
                    // 两分支语义等价（都把 triggered=false + reset_time=now），用 if/else if 保持原行为。
                    for timer in state.tasks.values_mut() {
                        if !timer.config.enabled {
                            continue;
                        }
                        if timer.config.auto_reset_on_idle {
                            timer.reset_time = now;
                            timer.triggered = false;
                        } else if timer.triggered {
                            timer.triggered = false;
                            timer.reset_time = now;
                        }
                    }
                } else if !is_now_idle && was_idle {
                    // 刚从空闲状态恢复（用户回到电脑）
                    state.is_idle = false;

                    // 1) 「空闲重置」任务：从头开始倒计时（原有行为，不变）
                    // 2) 「离开即重置」兜底：恢复时再次确保没有遗留的 triggered 态。
                    //    正常情况下 idle 开始时已清除；此处防御性再清一次，覆盖「闲置期间
                    //    仍有 triggered 残留」的极端路径，杜绝浮窗卡触发态（排查入口：
                    //    若将来出现恢复后胶囊仍是提醒态，先查这里与 FloatingPreview 的
                    //    idle-status-changed 监听是否仍然生效）。
                    //
                    // 合并 1)+2) 为单次遍历（与 idle 进入分支同结构）。
                    for timer in state.tasks.values_mut() {
                        if !timer.config.enabled {
                            continue;
                        }
                        if timer.config.auto_reset_on_idle {
                            timer.reset_time = now;
                            timer.triggered = false;
                        } else if timer.triggered {
                            timer.triggered = false;
                            timer.reset_time = now;
                        }
                    }

                    state.idle_start = None;
                    state.idle_start_timestamp = None;
                    idle_status_changed = true;
                }

                current_idle_status = IdleStatus {
                    is_idle: state.is_idle,
                    idle_seconds,
                    threshold,
                    idle_start_timestamp: state.idle_start_timestamp,
                };

                // 如果处于空闲状态，不检查任务触发（计时暂停）
                if state.is_idle {
                    // 空闲时不触发任何任务，但仍然发送倒计时更新
                } else {
                    // 正常检查任务触发
                    for timer in state.tasks.values_mut() {
                        if !timer.config.enabled {
                            continue;
                        }
                        if timer.disabled_at.is_some() {
                            continue;
                        }

                        if timer.snoozed {
                            if now >= timer.reset_time {
                                tasks_to_trigger.push((TaskTriggeredPayload {
                                    id: timer.config.id.clone(),
                                    title: timer.config.title.clone(),
                                    desc: timer.config.desc.clone(),
                                    icon: timer.config.icon.clone(),
                                }, 0));
                                timer.triggered = true;
                                timer.snoozed = false;
                            }
                            continue;
                        }

                        if is_daily_task(&timer.config) {
                            if let Some(key) = current_daily_trigger_key(&timer.config) {
                                if timer.daily_last_trigger_key.as_deref() != Some(&key) {
                                    tasks_to_trigger.push((TaskTriggeredPayload {
                                        id: timer.config.id.clone(),
                                        title: timer.config.title.clone(),
                                        desc: timer.config.desc.clone(),
                                        icon: timer.config.icon.clone(),
                                    }, 0));
                                    timer.daily_last_trigger_key = Some(key);
                                    timer.triggered = true;
                                }
                            }
                        } else if !timer.triggered {
                            let elapsed = now.saturating_duration_since(timer.reset_time).as_secs();
                            let total_secs = if timer.config.debug_interval_seconds > 0 {
                                timer.config.debug_interval_seconds
                            } else {
                                timer.config.interval * 60
                            };

                            if elapsed >= total_secs {
                                println!("[定时器] ✅ 任务已触发: {} elapsed={}s total={}s", timer.config.id, elapsed, total_secs);
                                // 触发提醒
                                tasks_to_trigger.push((TaskTriggeredPayload {
                                    id: timer.config.id.clone(),
                                    title: timer.config.title.clone(),
                                    desc: timer.config.desc.clone(),
                                    icon: timer.config.icon.clone(),
                                }, 0));

                                // 标记为已触发，等待用户操作（重置或推迟）
                                timer.triggered = true;
                            } else {
                                let remaining = total_secs - elapsed;
                                if remaining <= 60 {
                                    println!("[定时器] ⏳ 任务即将触发: {} 剩余={}s", timer.config.id, remaining);
                                }
                            }
                        }
                    }

                    // near-miss 扫描：收集合并窗口内的未触发任务
                    // 注意：side effects（triggered/reset_time）只在 lock 模式下应用
                    if !tasks_to_trigger.is_empty() {
                        let now = Instant::now();
                        let window = state.merge_window_seconds;
                        for timer in state.tasks.values_mut() {
                            if !timer.config.enabled { continue; }
                            if timer.disabled_at.is_some() { continue; }
                            if timer.snoozed { continue; }
                            if timer.triggered { continue; }

                            let remaining = if is_daily_task(&timer.config) {
                                daily_remaining_seconds(&timer.config)
                            } else {
                                let elapsed = now.saturating_duration_since(timer.reset_time).as_secs();
                                let total_secs = if timer.config.debug_interval_seconds > 0 {
                                    timer.config.debug_interval_seconds
                                } else {
                                    timer.config.interval * 60
                                };
                                total_secs.saturating_sub(elapsed)
                            };
                            if remaining <= window {
                                println!("[定时器] 🔍 近似合并: {} 剩余={}s <= 窗口={}s", timer.config.id, remaining, window);
                                merged_near_ids.push(timer.config.id.clone());
                            }
                        }
                        if !merged_near_ids.is_empty() {
                            println!("[定时器] 近似合并结果: {:?}", merged_near_ids);
                        }
                    }
                }

            }

            // 空闲进入时关闭娱乐模式（在 timer_state 锁外执行，避免死锁）
            // 注意：保留 last_reminder_at（倒计时起点），避免空闲恢复后 countdown-update 读到 None 返回 00:00。
            if idle_entered {
                if let Some(ent_state) = app_handle.try_state::<EntertainmentModeState>() {
                    let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
                    guard.is_active = false;
                    guard.grace_deadline = None;
                    guard.last_sent = None;
                    guard.snoozed_until = None;
                }
                hide_capsule_window(&app_handle);
                let _ = app_handle.emit("entertainment-task-cleared", serde_json::json!({ "clearAll": true }));
                let _ = app_handle.emit("entertainment-mode-changed", serde_json::json!({ "active": false }));
            }

            // 浮窗可见性同步延后到下方分发块之后（见 #5）。

            // 启动期抑制：AppModeState 未初始化时默认 "notification" 会让早期 tick 走通知而非锁屏。
            // 未初始化时跳过分发（任务已 triggered=true，待初始化后下一 tick 正常分发）。
            let (app_mode_initialized, app_mode) = {
                if let Some(state) = app_handle.try_state::<AppModeState>() {
                    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
                    (guard.initialized, guard.mode.clone())
                } else {
                    (false, "notification".to_string())
                }
            };

            // ── 维度 B: 娱乐模式分发（独立于 app_mode_initialized）──
            // 娱乐模式有自己的独立窗口和事件，不依赖 appMode
            // 确定性主任务排序：remaining 升序 + id 升序
            sort_triggers(&mut tasks_to_trigger);

            let entertainment_active = {
                let ent_state = app_handle.state::<EntertainmentModeState>();
                let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
                let grace_seconds = guard.grace_seconds;  // 宽限期（秒），可配置，覆盖临时切出场景
                if !guard.enabled {
                    // 用户关闭开关：立即退出，清空状态
                    let prev_active = guard.is_active;
                    if prev_active {
                        guard.is_active = false;
                        guard.grace_deadline = None;
                        guard.last_reminder_at = None;
                        guard.snoozed_until = None;
                        guard.last_sent = None;
                    }
                    if prev_active {
                        let _ = app_handle.emit("entertainment-mode-changed", serde_json::json!({ "active": false }));
                        hide_capsule_window(&app_handle);
                    }
                    false
                } else {
                    let matched = is_entertainment_foreground(&app_handle);
                    let prev_active = guard.is_active;
                    if matched {
                        // 前台匹配：清除宽限期，确保激活
                        guard.grace_deadline = None;
                        if !prev_active {
                            guard.is_active = true;
                            // 保留已有的 last_reminder_at（空闲恢复场景），仅首次激活时设 now
                            if guard.last_reminder_at.is_none() {
                                guard.last_reminder_at = Some(Instant::now());
                            }
                            let _ = app_handle.emit("entertainment-mode-changed", serde_json::json!({ "active": true }));
                            // 娱乐窗口常驻：激活时立即显示（idle 态显示统一倒计时）
                            let _ = show_capsule_window(&app_handle);
                        }
                    } else if prev_active {
                        // 前台不匹配但之前激活：进入或保持宽限期
                        if guard.grace_deadline.is_none() {
                            guard.grace_deadline = Some(Instant::now() + Duration::from_secs(grace_seconds));
                        }
                        let expired = guard.grace_deadline
                            .map(|deadline| Instant::now() >= deadline)
                            .unwrap_or(true);
                        if expired {
                            // 宽限期过期：真正退出，清空状态
                            guard.is_active = false;
                            guard.grace_deadline = None;
                            guard.last_reminder_at = None;
                            guard.snoozed_until = None;
                            let _ = app_handle.emit("entertainment-mode-changed", serde_json::json!({ "active": false }));
                        }
                        // 宽限期内：保持 is_active = true，不 emit 事件（前端无感）
                    }
                    guard.is_active
                }
            };

            if entertainment_active {
                // 娱乐模式独立提醒节奏：完全不读取/合并任何任务的 interval，
                // 仅按用户设置的 reminder_seconds 周期发射一条写死的「健康休息」payload。
                let ent_state = app_handle.state::<EntertainmentModeState>();
                let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
                let now = Instant::now();
                // snoozed 期间不 fire；snooze 截止后自动清 snoozed_until 并以当下为新的 last_reminder_at
                if let Some(until) = guard.snoozed_until {
                    if now < until {
                        // 仍在 snooze 期间，不 fire（countdown-update 会单独显示 snooze 剩余）
                    } else {
                        // snooze 已过期，清理并重启计时
                        guard.snoozed_until = None;
                        guard.last_reminder_at = Some(now);
                        guard.last_sent = None;
                    }
                }
                // 触发条件：不在 snooze 期间 + 无未处理触发（last_sent 为 None）+ 倒计时已到
                // 注：last_sent 用作"已发射未 dismiss"标志，防止触发后每秒重复 emit
                let should_fire = guard.snoozed_until.is_none()
                    && guard.last_sent.is_none()
                    && match guard.last_reminder_at {
                        Some(last) => now.duration_since(last).as_secs() >= guard.reminder_seconds,
                        None => {
                            // 兜底：若未记录上次时刻，从当下开始计时，本 tick 不弹
                            guard.last_reminder_at = Some(now);
                            false
                        }
                    };
                if should_fire {
                    let _ = show_capsule_window(&app_handle);
                    let payload = serde_json::json!({
                        "taskId": "entertainment-unified",
                        "title": "健康休息",
                        "desc": "该起来活动一下了~",
                        "icon": "entertainment",
                        "mergedIds": ["sit", "water", "eye"],
                    });
                    let _ = app_handle.emit("entertainment-task-triggered", payload.clone());
                    guard.last_sent = Some(LastSentEntertainment {
                        payload,
                        sent_at: now,
                    });
                    // 不更新 last_reminder_at：该字段同时是倒计时起点，触发时重置会导致 remaining 跳变到 reminder_seconds。
                    // 重复 emit 抑制已由 last_sent.is_some() 判断处理（见上方 should_fire 计算）。
                }
            }

            // ── 维度 A: appMode 分发（仅在娱乐模式未激活 + appMode 已初始化时执行）──
            if !entertainment_active && app_mode_initialized {
                if let Some((first, _)) = tasks_to_trigger.first() {
                    if app_mode == "notification" {
                        // 通知模式：弹系统通知后由后端立即重置（"自动完成"），
                        // 避免一次性事件丢失后 triggered/remaining==0 永久滞留、前端圆环卡 0。
                        for (task, _) in &tasks_to_trigger {
                            let _ = app_handle.emit("task-notification", serde_json::json!({
                                "taskId": task.id,
                                "title": task.title,
                                "desc": task.desc,
                                "icon": task.icon,
                            }));
                        }
                        {
                            let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
                            let now = Instant::now();
                            for (task, _) in &tasks_to_trigger {
                                if let Some(timer) = state.tasks.get_mut(&task.id) {
                                    timer.triggered = false;
                                    timer.reset_time = now;
                                }
                            }
                        }
                    } else if app_mode == "lock" {
                        // 锁屏模式：合并同一 tick 的多任务触发 + near-miss 为一条 lock-screen-open
                        let mut merged_ids: Vec<String> = tasks_to_trigger.iter().skip(1).map(|(t, _)| t.id.clone()).collect();
                        merged_ids.extend(merged_near_ids.iter().cloned());
                        // lock 模式下对 near-miss 任务应用 side effects
                        {
                            let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
                            let now = Instant::now();
                            for near_id in &merged_near_ids {
                                if let Some(timer) = state.tasks.get_mut(near_id) {
                                    timer.triggered = true;
                                    timer.reset_time = now;
                                }
                            }
                        }
                        let _ = app_handle.emit("lock-screen-open", serde_json::json!({
                            "task_id": first.id,
                            "remaining": 0,
                            "merged_ids": merged_ids
                        }));
                    } else if app_mode == "floating" {
                        // 浮窗模式（回归纯粹）：每任务独立触发，不合并
                        println!("[定时器] 📡 浮窗模式：触发任务数: {}", tasks_to_trigger.len());
                        let _ = show_capsule_window(&app_handle);
                        for (task, _) in &tasks_to_trigger {
                            let _ = app_handle.emit("floating-task-triggered", serde_json::json!({
                                "taskId": task.id,
                                "title": task.title,
                                "desc": task.desc,
                                "icon": task.icon,
                            }));
                        }
                    }
                }
            }

            // 浮窗可见性同步延后到分发之后：通知模式分发会立即重置 triggered，
            // 此处重算后同步可避免该帧 has_triggered_tasks 仍为 true 导致的浮窗单帧闪现（#5）。
            let has_triggered_tasks = {
                let s = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
                s.tasks.values().any(|t| t.triggered)
            };
            sync_capsule_visibility(&app_handle, has_triggered_tasks);

            // 发送空闲状态更新（只在状态变化时发送，或每 5 秒发送一次状态）
            if idle_status_changed {
                let _ = app_handle.emit("idle-status-changed", current_idle_status.clone());
            }

            // 发送倒计时更新（仅在有变化时打印调试日志）
            let countdowns = get_countdowns();
            for c in &countdowns {
                let prev = prev_remaining.get(&c.id).copied().unwrap_or(c.total);
                if c.remaining == 0 && prev > 0 {
                    // 触发
                } else if c.remaining > 0 && prev == 0 {
                    println!("[定时器] 🔄 任务已重置: {} remaining={}s", c.id, c.remaining);
                } else if c.remaining <= 60 && c.remaining > 0 && c.remaining != prev {
                    println!("[定时器] ⏳ 任务即将触发: {} 剩余={}s", c.id, c.remaining);
                }
                prev_remaining.insert(c.id.clone(), c.remaining);
            }
            // 构造 countdown-update payload：三项倒计时 + 娱乐独立倒计时
            // 娱乐倒计时由用户设置的 reminder_seconds 独立驱动，完全不读任何任务的剩余/总时长
            // snoozed 期间显示 snooze 剩余，否则显示 reminder 剩余
            let entertainment = if entertainment_active {
                let ent_state = app_handle.try_state::<EntertainmentModeState>();
                let (seconds, last, snoozed_until, snooze_minutes) = match ent_state {
                    Some(s) => {
                        let g = s.0.lock().unwrap_or_else(|e| e.into_inner());
                        (g.reminder_seconds, g.last_reminder_at, g.snoozed_until, g.snooze_minutes)
                    }
                    None => (2700u64, None, None, 10u32),
                };
                let now = Instant::now();
                if let Some(until) = snoozed_until {
                    if now < until {
                        // snooze 期间：显示 snooze 剩余时间
                        let snooze_total = (snooze_minutes as u64) * 60;
                        let snooze_remaining = until.duration_since(now).as_secs();
                        Some(EntertainmentCountdown { remaining: snooze_remaining, total: snooze_total })
                    } else {
                        // snooze 已过期但尚未被 timer tick 清理（极少发生，因 timer tick 1Hz 会先处理）
                        Some(EntertainmentCountdown { remaining: 0, total: seconds })
                    }
                } else {
                    let elapsed = last
                        .map(|t| now.duration_since(t).as_secs())
                        .unwrap_or(seconds);
                    let remaining = seconds.saturating_sub(elapsed);
                    Some(EntertainmentCountdown { remaining, total: seconds })
                }
            } else {
                None
            };
            let payload = CountdownUpdatePayload { tasks: countdowns, entertainment };
            let _ = app_handle.emit("countdown-update", payload);
        }
    });
}

fn get_settings_path() -> PathBuf {
    let config_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    config_dir.join("care-buddy").join("settings.json")
}

fn migrate_old_settings() {
    let config_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let current_path = config_dir.join("care-buddy").join("settings.json");

    // Migration from health-reminder (previous name)
    let old_path = config_dir.join("health-reminder").join("settings.json");
    if !current_path.exists() && old_path.exists() {
        if let Some(parent) = current_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::copy(&old_path, &current_path);
    }

    // Migration from desk-reminder (original cloned project name)
    let very_old_path = config_dir.join("desk-reminder").join("settings.json");
    if !current_path.exists() && very_old_path.exists() {
        if let Some(parent) = current_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::copy(&very_old_path, &current_path);
    }
}

#[tauri::command]
fn load_settings() -> String {
    let path = get_settings_path();
    fs::read_to_string(path).unwrap_or_default()
}

#[tauri::command]
async fn save_settings(app: AppHandle, settings: String) -> Result<(), String> {
    let path = get_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, &settings).map_err(|e| e.to_string())?;

    // 解析合并窗口设置并更新 TimerState
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&settings) {
        let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(minutes) = json.get("mergeThreshold").and_then(|v| v.as_f64()) {
            state.merge_window_seconds = (minutes as u64) * 60;
        }
    }

    // 同步应用模式、透明度、应用列表到后端状态
    apply_settings_to_state(&app, &settings);

    // 通知浮窗更新状态（透明度/延后分钟数变化）
    if let Some(mode_state) = app.try_state::<AppModeState>() {
        let guard = mode_state.0.lock().unwrap_or_else(|e| e.into_inner());
        emit_or_warn!(app,"app-mode-changed", serde_json::json!({
            "mode": guard.mode,
            "opacity": guard.opacity,
            "snoozeMinutes": guard.snooze_minutes,
            "displayStrategy": guard.display_strategy,
        }));
        // 浮窗模式下按策略重新应用 always_on_top
        // 娱乐模式激活时不操作浮窗，避免闪现
        if guard.mode == "floating" {
            let ent_active = app.try_state::<EntertainmentModeState>()
                .map(|s| s.0.lock().unwrap_or_else(|e| e.into_inner()).is_active)
                .unwrap_or(false);
            if !ent_active {
                if let Some(window) = app.get_webview_window("capsule-window") {
                    if guard.display_strategy == "on-trigger" {
                        let _ = window.hide();
                        let _ = window.set_always_on_top(false);
                    } else {
                        let _ = window.set_always_on_top(true);
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn was_started_silent() -> bool {
    std::env::args().any(|arg| arg == "--silent")
}

fn play_custom_audio_file(file_path: &str) -> Result<(), String> {
    use std::fs::File;
    use rodio::{Decoder, OutputStreamBuilder, Sink};

    let stream_handle = OutputStreamBuilder::open_default_stream()
        .map_err(|e| format!("Failed to create audio output stream: {}", e))?;
    let sink = Sink::connect_new(stream_handle.mixer());
    let file = File::open(file_path)
        .map_err(|e| format!("Failed to open audio file: {}", e))?;
    let source = Decoder::try_from(BufReader::new(file))
        .map_err(|e| format!("Failed to decode audio file: {}", e))?;

    sink.append(source);
    sink.sleep_until_end();
    Ok(())
}

fn play_custom_audio_async(file_path: String) {
    thread::spawn(move || {
        let _ = play_custom_audio_file(&file_path);
    });
}

fn play_system_notification_sound() {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBeep(uType: u32) -> i32;
    }
    const MB_OK: u32 = 0x0000_0000;
    unsafe { MessageBeep(MB_OK); }
}

#[tauri::command]
fn play_notification_sound(custom_sound_path: Option<String>) -> Result<(), String> {
    if let Some(path) = custom_sound_path {
        if !path.trim().is_empty() && std::path::Path::new(&path).exists() {
            play_custom_audio_async(path);
            return Ok(());
        }
    }

    play_system_notification_sound();
    Ok(())
}

#[tauri::command]
fn test_custom_sound(file_path: String) -> Result<(), String> {
    if file_path.trim().is_empty() {
        return Err("No sound file selected".to_string());
    }

    if !std::path::Path::new(&file_path).exists() {
        return Err("Sound file does not exist".to_string());
    }

    play_custom_audio_async(file_path);
    Ok(())
}

#[cfg(target_os = "windows")]
fn set_windows_aumid() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let app_id: Vec<u16> = OsStr::new("com.carebuddy.app")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    extern "system" {
        fn SetCurrentProcessExplicitAppUserModelID(appID: *const u16) -> i32;
    }

    unsafe {
        SetCurrentProcessExplicitAppUserModelID(app_id.as_ptr());
    }
}

#[tauri::command]
fn show_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    // 设置 Windows AUMID，确保通知显示正确的应用名称和图标
    #[cfg(target_os = "windows")]
    set_windows_aumid();

    let icon_path = app.path().resource_dir()
        .ok()
        .map(|d| d.join("icons").join("128x128.png"))
        .filter(|p| p.exists());

    let mut builder = app.notification()
        .builder()
        .title(title)
        .body(body);

    if let Some(path) = icon_path {
        builder = builder.icon(path.to_string_lossy());
    }

    builder.show().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    emit_or_warn!(app,"app-restored", ());
    Ok(())
}

#[tauri::command]
fn hide_main_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
fn minimize_main_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn is_main_window_visible(window: tauri::Window) -> bool {
    window.is_visible().unwrap_or(false)
}

/// 胶囊（浮窗 / 娱乐共用）位置，物理像素。
/// 回退链：capsule → floating → entertainment，确保拖过任一窗口，另一窗口切换时也落同一点。
fn get_saved_capsule_position() -> Option<(f64, f64)> {
    let path = get_settings_path();
    let content = fs::read_to_string(&path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    for key in ["capsule_position_x", "floating_position_x", "entertainment_position_x"] {
        let x = json.get(key).and_then(|v| v.as_f64());
        let y_key = key.replace("_x", "_y");
        let y = json.get(&y_key).and_then(|v| v.as_f64());
        if let (Some(x), Some(y)) = (x, y) {
            return Some((x, y));
        }
    }
    None
}

/// 将已有窗口移动到共享胶囊位置（物理像素）
/// 首次创建时由 ensure_capsule_window 设置位置，show 已存在窗口时由本函数同步
#[allow(dead_code)]
fn sync_window_position(app: &AppHandle, label: &str) {
    if let Some((sx, sy)) = get_saved_capsule_position() {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(sx as i32, sy as i32)));
        }
    }
}

fn ensure_capsule_window(app: &AppHandle, visible_on_create: bool) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window("capsule-window") {
        return Ok(window);
    }

    let builder = WebviewWindowBuilder::new(
        app,
        "capsule-window",
        WebviewUrl::App(PathBuf::from("index.html?mode=capsule")),
    )
    .title("Capsule")
    .inner_size(FLOATING_PREVIEW_WIDTH, FLOATING_HEIGHT)
    .resizable(false)
    .decorations(false)
    .skip_taskbar(true)
    .visible(visible_on_create)
    .transparent(true)
    .background_color(tauri::utils::config::Color(0, 0, 0, 0))
    .shadow(false)
    .always_on_top(true);

    // 尝试恢复保存的位置，否则居中于主显示器顶部。
    // 注意：前端保存的是「物理像素」(window.position() 返回 PhysicalPosition)，
    // 而 monitor 边界与 builder.position() 使用「逻辑像素」，需按各显示器 scale 换算，
    // 否则缩放屏(scale≠1)上位置错位甚至被判定越界而丢弃。
    let builder = if let Some((sx, sy)) = get_saved_capsule_position() {
        let matched_scale = app.available_monitors().ok().and_then(|monitors| {
            let mut found: Option<f64> = None;
            for m in monitors.iter() {
                let scale = m.scale_factor().max(1e-4);
                let sx_l = sx / scale;
                let sy_l = sy / scale;
                let g = m.position();
                let s = m.size();
                let mx = g.x as f64;
                let my = g.y as f64;
                let mw = s.width as f64;
                let mh = s.height as f64;
                if sx_l >= mx && sx_l + FLOATING_PREVIEW_WIDTH <= mx + mw
                    && sy_l >= my && sy_l + FLOATING_HEIGHT <= my + mh {
                    found = Some(scale);
                    break;
                }
            }
            found
        });
        if let Some(scale) = matched_scale {
            builder.position(sx / scale, sy / scale)
        } else if let Some(monitor) = app.primary_monitor().ok().flatten() {
            let ms = monitor.size();
            builder.position((ms.width as f64 - FLOATING_PREVIEW_WIDTH) / 2.0, 12.0)
        } else {
            builder
        }
    } else if let Some(monitor) = app.primary_monitor().ok().flatten() {
        let ms = monitor.size();
        builder.position((ms.width as f64 - FLOATING_PREVIEW_WIDTH) / 2.0, 12.0)
    } else {
        builder
    };

    let window = builder.build().map_err(|e| e.to_string())?;

    Ok(window)
}

fn hide_capsule_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("capsule-window") {
        let _ = window.hide();
    }
}

/// 裸 Win32 置顶（参考 NetSpeed force_window_topmost），仅改 z-order，不碰位置/尺寸
fn force_capsule_topmost(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::SetWindowPos;
        use windows::Win32::UI::WindowsAndMessaging::{SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE};

        if let Some(window) = app.get_webview_window("capsule-window") {
            if let Ok(hwnd) = window.hwnd() {
                let _ = unsafe {
                    SetWindowPos(
                        HWND(hwnd.0),
                        HWND(-1isize as _),
                        0, 0, 0, 0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    )
                };
            }
        }
    }
}

fn show_capsule_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("capsule-window") {
        if !window.is_visible().unwrap_or(false) {
            window.show().map_err(|e| e.to_string())?;
        }
        force_capsule_topmost(app);
    } else {
        let _window = ensure_capsule_window(app, true)?;
        force_capsule_topmost(app);
    }
    Ok(())
}

// 窗口滑出动画：向上偏移，然后隐藏
#[allow(dead_code)]
fn slide_out_and_hide(app: &AppHandle, label: &str) {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::c_void;
        use windows::Win32::Foundation::{HWND, RECT};
        use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};

        let window = match app.get_webview_window(label) {
            Some(w) => w,
            None => return,
        };
        let raw = match window.hwnd() {
            Ok(h) => h,
            Err(_) => return,
        };
        let hwnd = HWND(raw.0);

        let mut rect = RECT::default();
        unsafe {
            if GetWindowRect(hwnd, &mut rect).is_err() {
                let _ = window.hide();
                return;
            }
        }

        let origin_y = rect.top;
        let center_x = (rect.left + rect.right) / 2;
        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;

        let hwnd_val = raw.0 as isize;
        let label_owned = label.to_string();
        let app_clone = app.clone();

        thread::spawn(move || {
            let hwnd = HWND(hwnd_val as *mut c_void);
            let duration = 200.0;
            let start = Instant::now();

            loop {
                let elapsed = start.elapsed().as_secs_f64() * 1000.0;
                let t = (elapsed / duration).min(1.0);
                let offset = (30.0 * t).round() as i32;

                unsafe {
                    let _ = SetWindowPos(
                        hwnd,
                        HWND::default(),
                        center_x - w / 2,
                        origin_y - offset,
                        w,
                        h,
                        SWP_NOACTIVATE | SWP_NOZORDER,
                    );
                }

                if t >= 1.0 {
                    break;
                }
                thread::sleep(Duration::from_millis(8));
            }

            // 等前端 CSS 过渡完成
            thread::sleep(Duration::from_millis(200));
            if let Some(win) = app_clone.get_webview_window(&label_owned) {
                let _ = win.hide();
                let _ = win.set_always_on_top(false);
            }
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.hide();
        }
    }
}

#[tauri::command]
fn show_floating_window(app: AppHandle, state: State<FloatingState>) -> Result<(), String> {
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = true;
    let app_for_window = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = show_capsule_window(&app_for_window);
    });
    Ok(())
}

#[tauri::command]
fn hide_floating_window(app: AppHandle, state: State<FloatingState>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("capsule-window") {
        window.hide().map_err(|e| e.to_string())?;
    }
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = false;
    Ok(())
}

#[tauri::command]
fn set_floating_window_always_on_top(app: AppHandle, always_on_top: bool) -> Result<(), String> {
    let window = ensure_capsule_window(&app, false)?;
    window.set_always_on_top(always_on_top).map_err(|e| e.to_string())
}

/// 胶囊窗口整体弹簧伸缩（消除 WebView2 中间帧宽度缓存导致的裁切）。
/// 由前端在 phase 切换时调用：胶囊=窗口，前端 w-full 自动跟随窗口物理尺寸。
/// - window_label: "capsule-window"
/// - target_width: 目标逻辑宽（预览/idle 或触发态），目标高恒为 FLOATING_HEIGHT
/// - is_pinned: 预留参数（当前统一顶部居中锚定，不区分）
#[tauri::command]
fn start_capsule_resize(app: AppHandle, window_label: String, target_width: f64, _is_pinned: bool) {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::c_void;
        use windows::Win32::Foundation::{HWND, RECT};
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
        };

        let window = match app.get_webview_window(&window_label) {
            Some(w) => w,
            None => return,
        };
        let scale = window.scale_factor().unwrap_or(1.0);
        let raw = match window.hwnd() {
            Ok(h) => h,
            Err(_) => return,
        };
        let hwnd = HWND(raw.0);

        // 读取当前物理 rect 作为动画起点
        let mut rect = RECT::default();
        unsafe {
            if GetWindowRect(hwnd, &mut rect).is_err() {
                return;
            }
        }
        let start_w = (rect.right - rect.left) as f64;
        let start_h = (rect.bottom - rect.top) as f64;
        let center_x = (rect.left + rect.right) / 2;
        let origin_y = rect.top;

        let target_w = (target_width * scale).round();
        let target_h = (FLOATING_HEIGHT * scale).round();

        // 打断接续：递增动画 ID，旧线程发现 ID 变化即退出
        let my_id = CAPSULE_ANIMATION_ID.fetch_add(1, Ordering::SeqCst) + 1;
        {
            let mut anchor = CAPSULE_ANCHOR.lock().unwrap_or_else(|e| e.into_inner());
            *anchor = Some(CapsuleAnchor { center_x, origin_y, active_id: my_id });
        }

        // HWND 指针跨线程：转 isize 传递，线程内重建
        let hwnd_val = raw.0 as isize;
        std::thread::spawn(move || {
            let hwnd = HWND(hwnd_val as *mut c_void);
            let duration = 400.0_f64;
            let freq = 2.4_f64;
            let decay = 12.0_f64;
            let start = std::time::Instant::now();

            let read_anchor = || -> (i32, i32) {
                let anchor = CAPSULE_ANCHOR.lock().unwrap_or_else(|e| e.into_inner());
                match anchor.as_ref() {
                    Some(a) if a.active_id == my_id => (a.center_x, a.origin_y),
                    _ => (center_x, origin_y),
                }
            };

            loop {
                // 被新动画打断则退出
                if CAPSULE_ANIMATION_ID.load(Ordering::SeqCst) != my_id {
                    return;
                }
                let elapsed = start.elapsed().as_secs_f64() * 1000.0;
                let t = (elapsed / duration).min(1.0);
                // 弹簧公式：结束时收敛到 1
                let spring = 1.0
                    - (freq * t * 2.0 * std::f64::consts::PI).cos() * (-decay * t).exp();
                let w = (start_w + (target_w - start_w) * spring).round() as i32;
                let h = (start_h + (target_h - start_h) * spring).round() as i32;
                let (cx, oy) = read_anchor();
                unsafe {
                    let _ = SetWindowPos(
                        hwnd,
                        HWND::default(),
                        cx - w / 2,
                        oy,
                        w,
                        h,
                        SWP_NOACTIVATE | SWP_NOZORDER,
                    );
                }
                if t >= 1.0 {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(8));
            }

            // 结束：写入精确终态并清锚点（若未被打断）
            if CAPSULE_ANIMATION_ID.load(Ordering::SeqCst) == my_id {
                let w = target_w as i32;
                let h = target_h as i32;
                let (cx, oy) = read_anchor();
                unsafe {
                    let _ = SetWindowPos(
                        hwnd,
                        HWND::default(),
                        cx - w / 2,
                        oy,
                        w,
                        h,
                        SWP_NOACTIVATE | SWP_NOZORDER,
                    );
                }
                let mut anchor = CAPSULE_ANCHOR.lock().unwrap_or_else(|e| e.into_inner());
                if anchor.as_ref().map(|a| a.active_id == my_id).unwrap_or(false) {
                    *anchor = None;
                }
            }
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, window_label, target_width, _is_pinned);
    }
}

#[tauri::command]
fn start_floating_drag(app: AppHandle) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::{HWND, WPARAM, LPARAM};
        use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, PostMessageW, GA_ROOT, WM_NCLBUTTONDOWN};
        use windows::Win32::UI::Input::KeyboardAndMouse::ReleaseCapture;

        if let Some(window) = app.get_webview_window("capsule-window") {
            if let Ok(raw) = window.hwnd() {
                unsafe {
                    let root = GetAncestor(HWND(raw.0), GA_ROOT);
                    let _ = ReleaseCapture();
                    const HTCAPTION: usize = 2;
                    let _ = PostMessageW(root, WM_NCLBUTTONDOWN, WPARAM(HTCAPTION), LPARAM(0));
                }
            }
        }
    }
}

#[tauri::command]
fn save_floating_position(x: f64, y: f64) -> Result<(), String> {
    // 胶囊窗口共用锚点：统一写入 capsule_position_x/y
    let path = get_settings_path();
    let content = fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
    if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
        if let Some(obj) = json.as_object_mut() {
            let sx = (x * 100.0).round() / 100.0;
            let sy = (y * 100.0).round() / 100.0;
            obj.insert("capsule_position_x".to_string(), serde_json::json!(sx));
            obj.insert("capsule_position_y".to_string(), serde_json::json!(sy));
            obj.insert("floating_position_x".to_string(), serde_json::json!(sx));
            obj.insert("floating_position_y".to_string(), serde_json::json!(sy));
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            fs::write(&path, serde_json::to_string(&json).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn get_floating_position() -> Option<serde_json::Value> {
    let (x, y) = get_saved_capsule_position()?;
    Some(serde_json::json!({ "x": x, "y": y }))
}

#[tauri::command]
fn get_entertainment_position() -> Option<serde_json::Value> {
    let (x, y) = get_saved_capsule_position()?;
    Some(serde_json::json!({ "x": x, "y": y }))
}

// ============= 应用模式（娱乐模式） =============

#[tauri::command]
fn set_app_mode(mode: String, app: AppHandle, state: State<AppModeState>) -> Result<(), String> {
    let (opacity, snooze_minutes, display_strategy);
    {
        let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
        guard.mode = mode.clone();
        guard.initialized = true;
        opacity = guard.opacity;
        snooze_minutes = guard.snooze_minutes;
        display_strategy = guard.display_strategy.clone();
    }
    emit_or_warn!(app,"app-mode-changed", serde_json::json!({
        "mode": mode,
        "opacity": opacity,
        "snoozeMinutes": snooze_minutes,
        "displayStrategy": display_strategy,
    }));

    // 同步更新浮窗 always_on_top
    if let Some(window) = app.get_webview_window("capsule-window") {
        if mode == "floating" {
            if display_strategy == "on-trigger" {
                let _ = window.hide();
                let _ = window.set_always_on_top(false);
            } else {
                let _ = window.set_always_on_top(true);
            }
        } else {
            let _ = window.hide();
            let _ = window.set_always_on_top(false);
        }
    }

    // 切到 lock 模式时，若已有 triggered 任务，补发 lock-screen-open
    // （已 triggered 的任务不会在主循环中重复触发锁屏，需在此主动补发）
    // 切到 notification 模式时，重置已 triggered 任务（notification 自动完成语义）
    if mode == "lock" || mode == "notification" {
        timer_reopen_triggered(app.clone());
    }

    Ok(())
}

#[tauri::command]
fn get_app_mode(state: State<AppModeState>) -> String {
    state.0.lock().unwrap_or_else(|e| e.into_inner()).mode.clone()
}

#[tauri::command]
fn get_floating_state(state: State<AppModeState>) -> serde_json::Value {
    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    serde_json::json!({
        "mode": guard.mode,
        "opacity": guard.opacity,
        "snoozeMinutes": guard.snooze_minutes,
        "displayStrategy": guard.display_strategy,
    })
}

/// 拉取当前未处理的娱乐模式 triggered 任务（供娱乐窗口 mount 时补救事件丢失）
/// 返回条件：最近发射的 payload 存在 + `mount_recovery_seconds` 窗口内。
///
/// Rust-I1 清理：原 `!is_entertainment` 分支为死代码——所有 `last_sent` 写入点都来自
/// 娱乐分发，payload.taskId 始终是 "entertainment-unified"，is_entertainment 永远为 true。
/// `timer_reopen_triggered` 在娱乐激活时直接 return，进一步证实此判断。
/// 简化为：mount_recovery_seconds 窗口内直接返回 payload。
///
/// Rust-I4 修复：原 120 秒硬编码改为可配置的 `mount_recovery_seconds` 字段。
/// 语义：mount 补救窗口（覆盖娱乐窗口 mount + 用户看到的所有场景），
/// 与 reminder_seconds（提醒节奏）语义不同，独立配置。
#[tauri::command]
fn get_current_triggered_task(app: AppHandle) -> Option<serde_json::Value> {
    let ent_state = app.try_state::<EntertainmentModeState>()?;
    let guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
    let last_sent = guard.last_sent.as_ref()?;

    if last_sent.sent_at.elapsed().as_secs() > guard.mount_recovery_seconds {
        return None;
    }

    Some(last_sent.payload.clone())
}

/// 拉取娱乐模式窗口配置（透明度 + 延后时长），供 EntertainmentPreview mount 时使用
#[tauri::command]
fn get_entertainment_state(state: State<EntertainmentModeState>) -> serde_json::Value {
    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    serde_json::json!({
        "opacity": guard.opacity,
        "snoozeMinutes": guard.snooze_minutes,
    })
}

/// 拉取娱乐模式激活状态，供前端初始化时同步
#[tauri::command]
fn get_entertainment_active(state: State<EntertainmentModeState>) -> bool {
    state.0.lock().unwrap_or_else(|e| e.into_inner()).is_active
}

/// 隐藏胶囊窗口
#[tauri::command]
fn hide_entertainment_window_cmd(app: AppHandle) {
    hide_capsule_window(&app);
}

/// 启动娱乐窗口原生拖拽
#[tauri::command]
fn start_entertainment_drag(app: AppHandle) {
    if let Some(window) = app.get_webview_window("capsule-window") {
        let _ = window.start_dragging();
    }
}

/// 保存胶囊窗口位置
#[tauri::command]
fn save_entertainment_position(x: f64, y: f64) -> Result<(), String> {
    let path = get_settings_path();
    let content = fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
    let mut json: serde_json::Value = serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}));
    if let Some(obj) = json.as_object_mut() {
        obj.insert("capsule_position_x".to_string(), serde_json::json!(x));
        obj.insert("capsule_position_y".to_string(), serde_json::json!(y));
        obj.insert("entertainment_position_x".to_string(), serde_json::json!(x));
        obj.insert("entertainment_position_y".to_string(), serde_json::json!(y));
    }
    fs::write(&path, serde_json::to_string_pretty(&json).unwrap_or_default())
        .map_err(|e| e.to_string())
}

/// 实时更新娱乐窗口透明度
#[tauri::command]
fn set_entertainment_opacity(opacity: u64, state: State<EntertainmentModeState>, app: AppHandle) {
    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    guard.opacity = opacity.clamp(0, 100) as u8;
    emit_or_warn!(app,"entertainment-opacity-changed", guard.opacity);
}

/// 实时更新娱乐模式延后时长
#[tauri::command]
fn set_entertainment_snooze_minutes(minutes: u64, state: State<EntertainmentModeState>, app: AppHandle) {
    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    guard.snooze_minutes = minutes as u32;
    emit_or_warn!(app,"entertainment-snooze-changed", guard.snooze_minutes);
}

#[tauri::command]
fn sync_entertainment_apps(
    mut apps: Vec<EntertainmentAppRule>,
    state: State<EntertainmentAppsState>,
) -> Result<(), String> {
    // 反序列化后 pattern_lc 为空，需显式填充
    for rule in &mut apps {
        rule.fill_pattern_lc();
    }
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = apps;
    Ok(())
}

#[tauri::command]
fn list_running_windows() -> Result<Vec<WindowInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::path::Path;
        use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
        use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
        use windows::Win32::System::Threading::{
            OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
        };

        unsafe extern "system" fn enum_wnd(hwnd: HWND, lparam: LPARAM) -> windows::Win32::Foundation::BOOL {
            let list = lparam.0 as *mut Vec<WindowInfo>;
            if IsWindowVisible(hwnd).as_bool() {
                let mut buf = [0u16; 512];
                let len = GetWindowTextW(hwnd, &mut buf);
                if len > 0 {
                    let title = String::from_utf16_lossy(&buf[..len as usize]);
                    let mut pid = 0u32;
                    GetWindowThreadProcessId(hwnd, Some(&mut pid));
                    if pid != 0 {
                        let access = PROCESS_QUERY_INFORMATION | PROCESS_VM_READ;
                        if let Ok(handle) = OpenProcess(access, false, pid) {
                            let mut path_buf = [0u16; 512];
                            let path_len = GetModuleFileNameExW(handle, None, &mut path_buf);
                            if path_len > 0 {
                                let path = String::from_utf16_lossy(&path_buf[..path_len as usize]);
                                if let Some(name) = Path::new(&path).file_stem() {
                                    let process = name.to_string_lossy().to_string();
                                    if process.eq_ignore_ascii_case("care-buddy") {
                                        let _ = CloseHandle(handle);
                                        return true.into();
                                    }
                                    (*list).push(WindowInfo { title, process });
                                }
                            }
                            let _ = CloseHandle(handle);
                        }
                    }
                }
            }
            true.into()
        }

        let mut list: Vec<WindowInfo> = Vec::new();
        let _ = unsafe { EnumWindows(Some(enum_wnd), LPARAM(&mut list as *mut _ as isize)) };
        let mut seen = std::collections::HashSet::new();
        list.retain(|w| seen.insert((w.process.clone(), w.title.clone())));
        Ok(list)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

fn get_foreground_window_info() -> Option<(String, String)> {
    #[cfg(target_os = "windows")]
    unsafe {
        use std::path::Path;
        use windows::Win32::Foundation::CloseHandle;
        use windows::core::PWSTR;
        use windows::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
        };

        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut buf);
        let title = String::from_utf16_lossy(&buf[..len as usize]);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut path_buf = [0u16; 520];
            let mut path_len = path_buf.len() as u32;
            let pws = PWSTR(path_buf.as_mut_ptr());
            if QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), pws, &mut path_len).is_ok() {
                let path = String::from_utf16_lossy(&path_buf[..path_len as usize]);
                let _ = CloseHandle(handle);
                return Path::new(&path)
                    .file_stem()
                    .map(|s| (title, s.to_string_lossy().to_string()));
            }
            let _ = CloseHandle(handle);
        }
    }
    None
}

fn is_entertainment_foreground(app: &AppHandle) -> bool {
    let rules = match app.try_state::<EntertainmentAppsState>() {
        Some(state) => state.0.lock().unwrap_or_else(|e| e.into_inner()).clone(),
        None => return false,
    };
    if rules.is_empty() {
        return false;
    }
    let (title, process) = match get_foreground_window_info() {
        Some(v) => v,
        None => return false,
    };
    // 排除本程序自身进程：娱乐胶囊/主窗口在前台时不应判定为命中
    // 进程不变，用 OnceLock 缓存避免每秒重算
    use std::sync::OnceLock;
    static SELF_PROCESS_LC: OnceLock<String> = OnceLock::new();
    let self_process_lc = SELF_PROCESS_LC.get_or_init(|| {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().to_lowercase()))
            .unwrap_or_default()
    });
    let process_lc = process.to_lowercase();
    if !self_process_lc.is_empty() && process_lc == self_process_lc.as_str() {
        return false;
    }
    let title_lc = title.to_lowercase();
    rules.iter().any(|rule| {
        // pattern_lc 在加载/同步时已填充（lower-case + 去 .exe 后缀）
        if rule.match_type == "process" {
            process_lc.contains(&rule.pattern_lc)
        } else {
            title_lc.contains(&rule.pattern_lc)
        }
    })
}

fn sync_capsule_visibility(app: &AppHandle, has_triggered_tasks: bool) {
    // 翻页器可见性策略：动画由 timer 循环切换点触发。此处仅做兜底隐藏。
    let entertainment_active = app.try_state::<EntertainmentModeState>()
        .map(|s| s.0.lock().unwrap_or_else(|e| e.into_inner()).is_active)
        .unwrap_or(false);
    if entertainment_active {
        // 娱乐激活时胶囊窗口由前端处理内容切换，不在此控制
        return;
    }

    let mode_state = app.state::<AppModeState>();
    let (current_mode, display_strategy);
    {
        let guard = mode_state.0.lock().unwrap_or_else(|e| e.into_inner());
        current_mode = guard.mode.clone();
        display_strategy = guard.display_strategy.clone();
    }

    if current_mode != "floating" {
        return;
    }

    if let Some(_window) = app.get_webview_window("capsule-window") {
        if display_strategy == "on-trigger" {
            if has_triggered_tasks {
                let _ = show_capsule_window(app);
            } else {
                let _ = _window.hide();
                let _ = _window.set_always_on_top(false);
            }
        } else {
            let _ = _window.set_always_on_top(true);
            if !_window.is_visible().unwrap_or(false) {
                let _ = show_capsule_window(app);
            }
        }
    }
}

fn apply_settings_to_state(app: &AppHandle, settings_json: &str) {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(settings_json) {
        if let Some(mode_state) = app.try_state::<AppModeState>() {
            let mut guard = mode_state.0.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(mode) = json.get("appMode").and_then(|v| v.as_str()) {
                guard.mode = mode.to_string();
            }
            guard.initialized = true;
            // 向后兼容：旧配置字段 entertainmentOpacity / entertainmentSnoozeMinutes
            let opacity = json.get("floatingOpacity").and_then(|v| v.as_u64())
                .or_else(|| json.get("entertainmentOpacity").and_then(|v| v.as_u64()));
            if let Some(opacity) = opacity {
                guard.opacity = opacity.clamp(0, 100) as u8;
            }
            let snooze = json.get("floatingSnoozeMinutes").and_then(|v| v.as_u64())
                .or_else(|| json.get("entertainmentSnoozeMinutes").and_then(|v| v.as_u64()));
            if let Some(snooze) = snooze {
                guard.snooze_minutes = snooze as u32;
            }
            if let Some(strategy) = json.get("floatingDisplayStrategy").and_then(|v| v.as_str()) {
                // 向后兼容：旧配置可能是 "app-matched"，fallback 到 "always"
                guard.display_strategy = match strategy {
                    "app-matched" => "always".to_string(),
                    s => s.to_string(),
                };
            }
        }
        // 娱乐模式相关字段写入独立的 EntertainmentModeState
        if let Some(ent_state) = app.try_state::<EntertainmentModeState>() {
            let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(enabled) = json.get("entertainmentModeEnabled").and_then(|v| v.as_bool()) {
                guard.enabled = enabled;
            }
            if let Some(min) = json.get("entertainmentIdleThreshold").and_then(|v| v.as_u64()) {
                guard.idle_threshold_seconds = min * 60;
            }
            // 独立配置项：娱乐窗口透明度（向后兼容 fallback 到 floatingOpacity）
            let ent_opacity = json.get("entertainmentOpacity").and_then(|v| v.as_u64())
                .or_else(|| json.get("floatingOpacity").and_then(|v| v.as_u64()));
            if let Some(opacity) = ent_opacity {
                guard.opacity = opacity.clamp(0, 100) as u8;
            }
            // 独立配置项：娱乐模式延后时长（向后兼容 fallback 到 floatingSnoozeMinutes）
            let ent_snooze = json.get("entertainmentSnoozeMinutes").and_then(|v| v.as_u64())
                .or_else(|| json.get("floatingSnoozeMinutes").and_then(|v| v.as_u64()));
            if let Some(snooze) = ent_snooze {
                guard.snooze_minutes = snooze as u32;
            }
            if let Some(min) = json.get("entertainmentReminderMinutes").and_then(|v| v.as_u64()) {
                guard.reminder_seconds = min.max(1) * 60;
            }
            // Rust-I4：mount 补救窗口（秒），未配置时保留默认 120 秒
            if let Some(sec) = json.get("entertainmentMountRecoverySeconds").and_then(|v| v.as_u64()) {
                guard.mount_recovery_seconds = sec.max(1);
            }
        }
        if let Some(apps_state) = app.try_state::<EntertainmentAppsState>() {
            if let Some(apps) = json.get("entertainmentApps").and_then(|v| v.as_array()) {
                let mut parsed: Vec<EntertainmentAppRule> = apps
                    .iter()
                    .filter_map(|v| serde_json::from_value(v.clone()).ok())
                    .collect();
                // 反序列化后 pattern_lc 为空，需显式填充
                for rule in &mut parsed {
                    rule.fill_pattern_lc();
                }
                *apps_state.0.lock().unwrap_or_else(|e| e.into_inner()) = parsed;
            }
        }
    }
}

#[tauri::command]
fn update_tray_tooltip(state: State<TrayState>, tooltip: String) {
    if let Some(tray) = state.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

#[tauri::command]
fn update_pause_menu(state: State<PauseMenuState>, lang_state: State<LanguageState>, paused: bool) {
    if let Some(menu_item) = state.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        let lang = lang_state.0.lock().unwrap_or_else(|e| e.into_inner());
        let text = if paused {
            get_tray_text("resume", &lang)
        } else {
            get_tray_text("pause", &lang)
        };
        let _ = menu_item.set_text(text);
    }
}

#[tauri::command]
fn update_tray_language(app: AppHandle, lang_state: State<LanguageState>, language: String) {
    // 更新语言状态
    *lang_state.0.lock().unwrap_or_else(|e| e.into_inner()) = language.clone();

    // 重新构建托盘菜单以应用新语言
    rebuild_tray_menu(&app);

    // 更新托盘提示文本
    let tray_state = app.state::<TrayState>();
    let guard = tray_state.0.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(tray) = guard.as_ref() {
        let _ = tray.set_tooltip(Some(get_tray_text("tooltip", &language)));
    }
}

fn create_slave_window(app: &AppHandle, monitor: &tauri::Monitor, task: Option<&LockTaskArgs>, index: usize, is_primary: bool) -> Option<String> {
    let label = format!("lock-slave-{}", index);
    
    let mut url_str = String::from("index.html?mode=lock_slave");
    if let Some(t) = task {
         let exercise_ids_str = t.exercise_ids.as_deref().unwrap_or(&[]).join(",");
         let mut serializer = form_urlencoded::Serializer::new(String::new());
         serializer
            .append_pair("title", &t.title)
            .append_pair("is_primary", &is_primary.to_string());
         // 主显示器传完整参数；副显示器只读 title，不接受交互
         if is_primary {
            serializer
               .append_pair("desc", &t.desc)
               .append_pair("duration", &t.duration.to_string())
               .append_pair("icon", &t.icon)
               .append_pair("strict_mode", &t.strict_mode.to_string())
               .append_pair("bg_image", &t.bg_image)
               .append_pair("auto_unlock", &t.auto_unlock.to_string())
               .append_pair("is_exercise_mode", &t.is_exercise_mode.to_string())
               .append_pair("exercise_package_id", t.exercise_package_id.as_deref().unwrap_or(""))
               .append_pair("exercise_ids", &exercise_ids_str);
         }
         let encoded = serializer.finish();
         url_str = format!("index.html?mode=lock_slave&{}", encoded);
    }

    match WebviewWindowBuilder::new(app, &label, WebviewUrl::App(PathBuf::from(url_str)))
        .title("Lock Screen")
        .always_on_top(true)
        .closable(false)
        .minimizable(false)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .visible(false)
        .focused(true)
        .build() {
        Ok(slave) => {
            let _ = slave.set_position(*monitor.position());
            let _ = slave.set_size(tauri::Size::Physical(*monitor.size()));
            let _ = slave.show();
            let _ = slave.set_focus();
            let _ = slave.set_fullscreen(true);

            Some(label)
        }
        Err(e) => {
            eprintln!("[CareBuddy] Failed to create lock slave window '{}': {}", label, e);
            None
        }
    }
}

#[tauri::command]
async fn enter_lock_mode(app: tauri::AppHandle, state: State<'_, LockState>, task: Option<LockTaskArgs>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    // 进入锁屏时隐藏胶囊窗口
    // 注：娱乐模式与 appMode 互斥，enter_lock_mode 实际不会在娱乐激活时被调用
    // （task-notification 在 !entertainment_active 分发块内才 emit）。
    // Win+L 系统锁屏路径的娱乐状态清理见 timer_set_system_locked。
    hide_capsule_window(&app);

    let monitors = window.available_monitors().unwrap_or_default();
    // 主显示器：完整锁屏；副显示器：仅显示提示
    let primary = window.primary_monitor().ok().flatten();

    let mut created_windows = Vec::new();

    // Create a full-screen lock slave on EVERY monitor (including primary)
    for (i, m) in monitors.iter().enumerate() {
        let is_primary = primary
            .as_ref()
            .map(|p| p.position() == m.position())
            .unwrap_or(i == 0);
        if let Some(label) = create_slave_window(&app, m, task.as_ref(), i, is_primary) {
            created_windows.push(label);
        }
    }
    
    let mut state_guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    state_guard.windows.extend(created_windows);
    state_guard.args = task;

    Ok(())
}

#[tauri::command]
fn exit_lock_mode(app: tauri::AppHandle, state: State<LockState>) {
    let mut state_guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    for label in state_guard.windows.iter() {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.close();
        }
    }
    state_guard.windows.clear();
    state_guard.args = None;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(false);
    }
}

pub fn run() {
    migrate_old_settings();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--silent"])
        ))
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            was_started_silent,
            play_notification_sound,
            test_custom_sound,
            show_notification,
            show_main_window,
            hide_main_window,
            minimize_main_window,
            is_main_window_visible,
            show_floating_window,
            hide_floating_window,
            set_floating_window_always_on_top,
            start_floating_drag,
            start_capsule_resize,
            save_floating_position,
            get_floating_position,
            update_tray_tooltip,
            update_pause_menu,
            update_tray_language,
            enter_lock_mode,
            exit_lock_mode,
            sync_tasks,
            timer_pause,
            timer_resume,
            timer_is_paused,
            timer_pause_task,
            timer_resume_task,
            timer_reset_task,
            timer_reset_all,
            timer_snooze_task,
            timer_toggle_task,
            get_countdowns,
            timer_reopen_triggered,
            timer_set_system_locked,
            timer_set_lock_screen_active,
            set_idle_threshold,
            get_idle_threshold,
            set_entertainment_idle_threshold,
            set_entertainment_reminder,
            set_entertainment_exit_threshold,
            snooze_entertainment,
            set_entertainment_mode_enabled,
            set_app_mode,
            get_app_mode,
            get_floating_state,
            get_current_triggered_task,
            get_entertainment_state,
            get_entertainment_active,
            hide_entertainment_window_cmd,
            start_entertainment_drag,
            save_entertainment_position,
            get_entertainment_position,
            set_entertainment_opacity,
            set_entertainment_snooze_minutes,
            sync_entertainment_apps,
            list_running_windows,
        ])
        .manage(TrayState(Mutex::new(None)))
        .manage(FloatingState(Mutex::new(false)))
        .manage(AppModeState(Mutex::new(AppModeInner {
            mode: "notification".to_string(),
            opacity: 55,
            snooze_minutes: 5,
            display_strategy: "always".to_string(),
            initialized: false,
        })))
        .manage(EntertainmentModeState(Mutex::new(EntertainmentModeInner::default())))
        .manage(EntertainmentAppsState(Mutex::new(Vec::new())))
        .manage(LockState(Mutex::new(LockStateInner {
            windows: Vec::new(),
            args: None,
        })))
        .manage(PauseMenuState(Mutex::new(None)))
        .manage(LanguageState(Mutex::new("zh-CN".to_string())))
        .setup(|app| {
            // 注册 Windows AUMID，确保通知显示正确的应用身份
            #[cfg(target_os = "windows")]
            set_windows_aumid();

            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let reset = MenuItem::with_id(app, "reset", "重置所有任务", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "暂停", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &pause, &reset, &quit])?;
            
            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("健康提醒助手")
                .on_menu_event(|app, event| {
                    let id_str = event.id.as_ref();
                    if id_str == "quit" {
                        app.exit(0);
                    } else if id_str == "show" {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    } else if id_str == "reset" {
                        emit_or_warn!(app,"reset-all-tasks", ());
                    } else if id_str == "pause" {
                        emit_or_warn!(app,"toggle-pause", ());
                    } else if id_str.starts_with("reset_task_") {
                        let task_id = id_str.trim_start_matches("reset_task_");
                        let mut state = get_timer_state().lock().unwrap_or_else(|e| e.into_inner());
                        let now = Instant::now();
                        let was_triggered = if let Some(timer) = state.tasks.get_mut(task_id) {
                            let was = timer.triggered;
                            timer.reset_time = now;
                            timer.triggered = false;
                            timer.snoozed = false;
                            timer.snooze_count = 0;
                            timer.disabled_at = None;  // Fix A：清除单任务暂停状态
                            was
                        } else {
                            false
                        };
                        drop(state);
                        if was_triggered {
                            emit_or_warn!(app,"floating-task-cleared", serde_json::json!({ "taskId": task_id }));
                        }
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                            emit_or_warn!(app,"app-restored", ());
                        }
                    }
                })
                .build(app)?;
            
            *app.state::<TrayState>().0.lock().unwrap_or_else(|e| e.into_inner()) = Some(tray);
            *app.state::<PauseMenuState>().0.lock().unwrap_or_else(|e| e.into_inner()) = Some(pause);

            // 加载设置并同步到后端状态
            let settings_json = load_settings();
            apply_settings_to_state(app.handle(), &settings_json);

            // 启动时把当前模式广播给前端，确保前端与后端状态一致
            {
                let mode_state = app.state::<AppModeState>();
                let guard = mode_state.0.lock().unwrap_or_else(|e| e.into_inner());
                let mode = guard.mode.clone();
                let opacity = guard.opacity;
                let snooze_minutes = guard.snooze_minutes;
                let display_strategy = guard.display_strategy.clone();
                drop(guard);
                emit_or_warn!(app,"app-mode-changed", serde_json::json!({
                    "mode": mode,
                    "opacity": opacity,
                    "snoozeMinutes": snooze_minutes,
                    "displayStrategy": display_strategy,
                }));
            }

            // 监听浮窗任务关闭事件："on-trigger" 策略下关闭后隐藏窗口并取消置顶
            let app_handle = app.handle().clone();
            app.listen("floating-task-dismissed", move |_| {
                if let Some(window) = app_handle.get_webview_window("capsule-window") {
                    let strategy = app_handle
                        .try_state::<AppModeState>()
                        .map(|s| s.0.lock().unwrap_or_else(|e| e.into_inner()).display_strategy.clone())
                        .unwrap_or_default();
                    if strategy == "on-trigger" {
                        let _ = window.hide();
                        let _ = window.set_always_on_top(false);
                    }
                }
            });

            // 监听娱乐模式任务关闭事件：仅在 done 路径重置倒计时 + 清理 last_sent。
            // snooze 路径由 snooze_entertainment 命令处理（设置 snoozed_until，不动 last_reminder_at）。
            // 不隐藏窗口——窗口应保持在 idle 预览态。
            let app_handle = app.handle().clone();
            app.listen("entertainment-task-dismissed", move |event| {
                let action = serde_json::from_str::<serde_json::Value>(event.payload())
                    .ok()
                    .and_then(|v| v.get("action").and_then(|a| a.as_str()).map(String::from))
                    .unwrap_or_else(|| "done".to_string());
                if action != "done" {
                    // snooze 路径由 snooze_entertainment 命令处理，不在此重置 last_reminder_at
                    return;
                }
                if let Some(ent_state) = app_handle.try_state::<EntertainmentModeState>() {
                    let mut guard = ent_state.0.lock().unwrap_or_else(|e| e.into_inner());
                    guard.last_reminder_at = Some(Instant::now());
                    guard.last_sent = None;
                }
            });

            // 启动时初始化浮窗 WebView2（Tauri bug #15652: visible:false 的窗口可能永久无法接收事件）
            {
                let app_handle = app.handle().clone();
                let mode_state = app.state::<AppModeState>();
                let mode = mode_state.0.lock().unwrap_or_else(|e| e.into_inner()).mode.clone();
                if mode == "floating" {
                    std::thread::spawn(move || {
                        // 创建胶囊窗口并显示，让 WebView2 完成初始化
                        if let Ok(window) = ensure_capsule_window(&app_handle, false) {
                            // 先置顶再显示，避免窗口短暂出现在其他窗口后面
                            let _ = window.set_always_on_top(true);
                            let _ = window.show();
                            std::thread::sleep(std::time::Duration::from_millis(100));
                            // 根据策略决定是否隐藏
                            let strategy = app_handle
                                .try_state::<AppModeState>()
                                .map(|s| s.0.lock().unwrap_or_else(|e| e.into_inner()).display_strategy.clone())
                                .unwrap_or_default();
                            if strategy != "always" {
                                let _ = window.hide();
                                let _ = window.set_always_on_top(false);
                            }
                        }
                    });
                }
            }

            // 启动时预创建娱乐模式窗口（若开关已启用），避免首次触发时 WebView2 冷启动延迟
            // 注：预创建已被移除，窗口由 show_capsule_window 按需创建

            // 启动后端定时器线程
            start_timer_thread(app.handle().clone());

            start_session_monitor(app.handle().clone());
            
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // If the window is a lock slave, just close it (don't prevent close)
                // The label check: main window has label "main" (default).
                // Slave windows have "lock-slave-X".
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
        });
}

// =============================================================================
// 单元测试
// =============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    /// 构造 interval 类型 TaskConfig
    fn mk_interval_config(id: &str, interval_minutes: u64) -> TaskConfig {
        TaskConfig {
            id: id.to_string(),
            title: format!("Task {}", id),
            desc: String::new(),
            interval: interval_minutes,
            enabled: true,
            icon: "default".to_string(),
            auto_reset_on_idle: false,
            schedule_type: "interval".to_string(),
            daily_time: None,
            debug_interval_seconds: 0,
            lock_duration: 0,
            pre_notification_seconds: 0,
            snooze_minutes: 0,
            is_exercise_task: false,
            exercise_package_id: None,
            exercise_ids: None,
        }
    }

    /// 构造 daily 类型 TaskConfig
    fn mk_daily_config(id: &str, daily_time: &str) -> TaskConfig {
        TaskConfig {
            id: id.to_string(),
            title: format!("Daily {}", id),
            desc: String::new(),
            interval: 0,
            enabled: true,
            icon: "default".to_string(),
            auto_reset_on_idle: false,
            schedule_type: "daily".to_string(),
            daily_time: Some(daily_time.to_string()),
            debug_interval_seconds: 0,
            lock_duration: 0,
            pre_notification_seconds: 0,
            snooze_minutes: 0,
            is_exercise_task: false,
            exercise_package_id: None,
            exercise_ids: None,
        }
    }

    /// 构造 TaskTimer（reset_time=now, triggered=false, snoozed=false）
    fn mk_timer(config: TaskConfig) -> TaskTimer {
        TaskTimer {
            config,
            reset_time: Instant::now(),
            triggered: false,
            disabled_at: None,
            snoozed: false,
            snooze_count: 0,
            daily_last_trigger_key: None,
        }
    }

    fn mk_payload(id: &str) -> TaskTriggeredPayload {
        TaskTriggeredPayload {
            id: id.to_string(),
            title: String::new(),
            desc: String::new(),
            icon: String::new(),
        }
    }

    // ───── is_daily_task ─────
    #[test]
    fn is_daily_task_true() {
        let cfg = mk_daily_config("d1", "10:00");
        assert!(is_daily_task(&cfg));
    }

    #[test]
    fn is_daily_task_false_when_interval() {
        let cfg = mk_interval_config("i1", 30);
        assert!(!is_daily_task(&cfg));
    }

    #[test]
    fn is_daily_task_false_when_no_time() {
        let mut cfg = mk_daily_config("d1", "10:00");
        cfg.daily_time = None;
        assert!(!is_daily_task(&cfg));
    }

    // ───── compute_total_secs ─────
    #[test]
    fn compute_total_secs_debug_takes_priority() {
        let mut cfg = mk_interval_config("i1", 10);
        cfg.debug_interval_seconds = 42;
        let timer = mk_timer(cfg);
        assert_eq!(compute_total_secs(&timer), 42);
    }

    #[test]
    fn compute_total_secs_daily_returns_86400() {
        let cfg = mk_daily_config("d1", "10:00");
        let timer = mk_timer(cfg);
        assert_eq!(compute_total_secs(&timer), 86400);
    }

    #[test]
    fn compute_total_secs_interval_returns_minutes_x_60() {
        let cfg = mk_interval_config("i1", 10);
        let timer = mk_timer(cfg);
        assert_eq!(compute_total_secs(&timer), 600);
    }

    #[test]
    fn compute_total_secs_zero_interval() {
        let cfg = mk_interval_config("i1", 0);
        let timer = mk_timer(cfg);
        assert_eq!(compute_total_secs(&timer), 0);
    }

    // 注：compute_total_secs 在极端 interval（如 u64::MAX/30）下 *60 会溢出。
    // 当前实现 debug 模式 panic / release 模式 wrap，无法用 should_panic 可靠标记。
    // 阶段 3 修复为 saturating_mul 后再加溢出用例。

    // ───── parse_daily_time ─────
    #[test]
    fn parse_daily_time_valid() {
        assert_eq!(parse_daily_time("10:30"), Some((10, 30)));
        assert_eq!(parse_daily_time("00:00"), Some((0, 0)));
        assert_eq!(parse_daily_time("23:59"), Some((23, 59)));
    }

    #[test]
    fn parse_daily_time_trims_whitespace() {
        assert_eq!(parse_daily_time("  10:30  "), Some((10, 30)));
    }

    #[test]
    fn parse_daily_time_rejects_hour_out_of_range() {
        assert_eq!(parse_daily_time("24:00"), None);
        assert_eq!(parse_daily_time("99:00"), None);
    }

    #[test]
    fn parse_daily_time_rejects_minute_out_of_range() {
        assert_eq!(parse_daily_time("10:60"), None);
        assert_eq!(parse_daily_time("10:99"), None);
    }

    #[test]
    fn parse_daily_time_rejects_missing_minute() {
        assert_eq!(parse_daily_time("10"), None);
    }

    #[test]
    fn parse_daily_time_rejects_extra_segments() {
        assert_eq!(parse_daily_time("10:30:45"), None);
    }

    #[test]
    fn parse_daily_time_rejects_empty_and_garbage() {
        assert_eq!(parse_daily_time(""), None);
        assert_eq!(parse_daily_time("abc"), None);
        assert_eq!(parse_daily_time("ab:cd"), None);
    }

    // ───── current_daily_trigger_key ─────
    #[test]
    fn current_daily_trigger_key_none_for_interval_task() {
        let cfg = mk_interval_config("i1", 30);
        assert!(current_daily_trigger_key(&cfg).is_none());
    }

    #[test]
    fn current_daily_trigger_key_none_for_daily_without_time() {
        let mut cfg = mk_daily_config("d1", "10:00");
        cfg.daily_time = None;
        assert!(current_daily_trigger_key(&cfg).is_none());
    }

    #[test]
    fn current_daily_trigger_key_none_for_invalid_time() {
        let cfg = mk_daily_config("d1", "99:99");
        assert!(current_daily_trigger_key(&cfg).is_none());
    }

    // 注：daily_remaining_seconds 与 current_daily_trigger_key 依赖 Local::now()，
    // 无法做精确断言。仅验证 None / Invalid 路径。

    #[test]
    fn daily_remaining_seconds_none_returns_86400() {
        let mut cfg = mk_daily_config("d1", "10:00");
        cfg.daily_time = None;
        assert_eq!(daily_remaining_seconds(&cfg), 86400);
    }

    #[test]
    fn daily_remaining_seconds_invalid_returns_86400() {
        let cfg = mk_daily_config("d1", "99:99");
        assert_eq!(daily_remaining_seconds(&cfg), 86400);
    }

    // ───── sort_triggers ─────
    #[test]
    fn sort_triggers_by_remaining_then_id() {
        let mut vec = vec![
            (mk_payload("b"), 10),
            (mk_payload("a"), 5),
            (mk_payload("c"), 5),
        ];
        sort_triggers(&mut vec);
        // remaining=5 优先（a, c），id 升序；remaining=10 在后
        assert_eq!(vec[0].0.id, "a");
        assert_eq!(vec[1].0.id, "c");
        assert_eq!(vec[2].0.id, "b");
    }

    #[test]
    fn sort_triggers_empty() {
        let mut vec: Vec<(TaskTriggeredPayload, u64)> = vec![];
        sort_triggers(&mut vec);
        assert!(vec.is_empty());
    }

    #[test]
    fn sort_triggers_single() {
        let mut vec = vec![(mk_payload("x"), 0)];
        sort_triggers(&mut vec);
        assert_eq!(vec.len(), 1);
        assert_eq!(vec[0].0.id, "x");
    }

    #[test]
    fn sort_triggers_all_zero_remaining_sorts_by_id() {
        let mut vec = vec![
            (mk_payload("z"), 0),
            (mk_payload("y"), 0),
            (mk_payload("x"), 0),
        ];
        sort_triggers(&mut vec);
        assert_eq!(vec[0].0.id, "x");
        assert_eq!(vec[1].0.id, "y");
        assert_eq!(vec[2].0.id, "z");
    }

    // ───── TimerState::compensate_after_freeze ─────
    #[test]
    fn compensate_lock_screen_clears_triggered() {
        let mut state = TimerState::new();
        let cfg = mk_interval_config("t1", 30);
        let mut timer = mk_timer(cfg);
        timer.triggered = true;
        state.tasks.insert("t1".to_string(), timer);

        let freeze_start = Instant::now() - Duration::from_secs(60);
        let cleared = state.compensate_after_freeze(freeze_start, FreezeReason::LockScreenActive);

        assert_eq!(cleared, vec!["t1".to_string()]);
        assert!(!state.tasks.get("t1").unwrap().triggered);
        assert!(!state.tasks.get("t1").unwrap().snoozed);
        assert_eq!(state.tasks.get("t1").unwrap().snooze_count, 0);
    }

    #[test]
    fn compensate_lock_screen_skips_snoozed() {
        let mut state = TimerState::new();
        let cfg = mk_interval_config("t1", 30);
        let mut timer = mk_timer(cfg);
        timer.snoozed = true;
        timer.snooze_count = 2;
        state.tasks.insert("t1".to_string(), timer);

        let freeze_start = Instant::now() - Duration::from_secs(60);
        let cleared = state.compensate_after_freeze(freeze_start, FreezeReason::LockScreenActive);

        // snoozed 任务不补偿，不应被清
        assert!(cleared.is_empty());
        assert!(state.tasks.get("t1").unwrap().snoozed);
        assert_eq!(state.tasks.get("t1").unwrap().snooze_count, 2);
    }

    #[test]
    fn compensate_lock_screen_skips_reset_after_freeze_start() {
        let mut state = TimerState::new();
        let cfg = mk_interval_config("t1", 30);
        let mut timer = mk_timer(cfg);
        // 冻结期间被重置过：reset_time > freeze_start
        timer.reset_time = Instant::now();
        state.tasks.insert("t1".to_string(), timer);

        let freeze_start = Instant::now() - Duration::from_secs(60);
        let cleared = state.compensate_after_freeze(freeze_start, FreezeReason::LockScreenActive);

        assert!(cleared.is_empty());
    }

    #[test]
    fn compensate_watchdog_clears_triggered() {
        let mut state = TimerState::new();
        let cfg = mk_interval_config("t1", 30);
        let mut timer = mk_timer(cfg);
        timer.triggered = true;
        state.tasks.insert("t1".to_string(), timer);

        let freeze_start = Instant::now() - Duration::from_secs(60);
        let cleared = state.compensate_after_freeze(freeze_start, FreezeReason::Watchdog);

        assert_eq!(cleared, vec!["t1".to_string()]);
        assert!(!state.tasks.get("t1").unwrap().triggered);
    }

    #[test]
    fn compensate_system_locked_auto_reset_clears_triggered() {
        let mut state = TimerState::new();
        let mut cfg = mk_interval_config("t1", 30);
        cfg.auto_reset_on_idle = true;
        let mut timer = mk_timer(cfg);
        timer.triggered = true;
        timer.snoozed = true;
        timer.snooze_count = 3;
        state.tasks.insert("t1".to_string(), timer);

        let freeze_start = Instant::now() - Duration::from_secs(60);
        let cleared = state.compensate_after_freeze(freeze_start, FreezeReason::SystemLocked);

        // auto_reset 任务在 SystemLocked 下被重置，但不在 cleared 列表（无 triggered 信号需要通知）
        // 实际看代码：SystemLocked 路径只 push cleared 在 LockScreenActive/Watchdog 路径，
        // SystemLocked 路径不 push cleared。验证 cleared 为空。
        assert!(cleared.is_empty());
        let t = state.tasks.get("t1").unwrap();
        assert!(!t.triggered);
        assert!(!t.snoozed);
        assert_eq!(t.snooze_count, 0);
    }

    #[test]
    fn compensate_paused_shifts_reset_time() {
        let mut state = TimerState::new();
        let cfg = mk_interval_config("t1", 30);
        let mut timer = mk_timer(cfg);
        let original_reset = Instant::now() - Duration::from_secs(120);
        timer.reset_time = original_reset;
        state.tasks.insert("t1".to_string(), timer);

        let freeze_start = Instant::now() - Duration::from_secs(60);
        let cleared = state.compensate_after_freeze(freeze_start, FreezeReason::Paused);

        // Paused 路径：reset_time += freeze_duration（后移约 60s），cleared 为空
        assert!(cleared.is_empty());
        let t = state.tasks.get("t1").unwrap();
        // reset_time 应后移约 60s
        let shift = t.reset_time.duration_since(original_reset);
        assert!(shift.as_secs() >= 60 && shift.as_secs() <= 65,
            "expected shift ~60s, got {:?}", shift);
    }

    #[test]
    fn compensate_paused_skips_reset_after_freeze_start() {
        let mut state = TimerState::new();
        let cfg = mk_interval_config("t1", 30);
        let mut timer = mk_timer(cfg);
        // reset_time 在 freeze_start 之后
        timer.reset_time = Instant::now() + Duration::from_secs(10);
        let original_reset = timer.reset_time;
        state.tasks.insert("t1".to_string(), timer);

        let freeze_start = Instant::now() - Duration::from_secs(60);
        let cleared = state.compensate_after_freeze(freeze_start, FreezeReason::Paused);

        assert!(cleared.is_empty());
        // reset_time 不变
        assert_eq!(state.tasks.get("t1").unwrap().reset_time, original_reset);
    }

    #[test]
    fn compensate_lock_screen_handles_disabled_at() {
        let mut state = TimerState::new();
        let cfg = mk_interval_config("t1", 30);
        let mut timer = mk_timer(cfg);
        // reset_time 必须早于 freeze_start 才能走到平移分支
        let original_reset = Instant::now() - Duration::from_secs(120);
        let original_disabled = Instant::now() - Duration::from_secs(120);
        timer.reset_time = original_reset;
        timer.disabled_at = Some(original_disabled);
        state.tasks.insert("t1".to_string(), timer);

        let freeze_start = Instant::now() - Duration::from_secs(60);
        let _ = state.compensate_after_freeze(freeze_start, FreezeReason::LockScreenActive);

        let t = state.tasks.get("t1").unwrap();
        // disabled_at 应后移约 60s（与 reset_time 同方向）
        let shift = t.disabled_at.unwrap().duration_since(original_disabled);
        assert!(shift.as_secs() >= 60 && shift.as_secs() <= 65,
            "expected disabled_at shift ~60s, got {:?}", shift);
    }

    #[test]
    fn timer_state_is_frozen_initially_false() {
        let state = TimerState::new();
        assert!(!state.is_frozen());
    }

    #[test]
    fn timer_state_is_frozen_when_paused() {
        let mut state = TimerState::new();
        state.paused = true;
        assert!(state.is_frozen());
    }

    #[test]
    fn timer_state_is_frozen_when_system_locked() {
        let mut state = TimerState::new();
        state.system_locked = true;
        assert!(state.is_frozen());
    }

    #[test]
    fn timer_state_is_frozen_when_lock_screen_active() {
        let mut state = TimerState::new();
        state.lock_screen_active = true;
        assert!(state.is_frozen());
    }
}
