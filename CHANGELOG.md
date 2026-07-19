# Changelog

## 1.7.0

### Features
- Task reminders with interval-based scheduling
- Floating capsule window for non-intrusive reminders
- Entertainment mode with dedicated capsule window
- Lock screen with guided exercise integration
- Notification and lock screen alert modes
- Idle detection with auto-reset
- System tray with pause/reset controls
- Multi-window support (main, floating, entertainment, lock slave)
- Medical-grade exercise library with guided sessions
- Dark/light/system theme support
- i18n with zh-CN and en-US
- Freeze compensation on pause/lock

### Technical
- Tauri v2 backend with Rust timer system
- React 19 + TypeScript strict mode
- Zustand state management
- Tailwind CSS v4 + shadcn UI
- Motion animations with spring physics
- Recharts data visualization

### Fixed
- Floating preview IPC race condition on idle transitions
- Entertainment mode countdown reset on trigger
- Snooze state cleanup across all reset paths
