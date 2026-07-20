// @vitest-environment jsdom
/**
 * 关键 hook 单元测试（Tier 4）
 *
 * 策略：复用真实 store（已验证可测），对 @tauri-apps 的 event/core 与
 * @/services 做 vi.mock，捕获 onAppModeUpdate / onSettingsUpdate / listen
 * 注册的回调，再用 renderHook + act 驱动，断言 store 状态与窗口命令的副作用。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useHealthStore } from '@/store';
import { eventCoordinator } from '@/services/eventCoordinator';
import { useAppModeSync } from '@/hooks/useAppModeSync';
import { useModeTransition } from '@/hooks/useModeTransition';

// 捕获各事件注册回调，供测试主动触发
const mocks = vi.hoisted(() => {
  const appModeCbs: ((p: any) => void)[] = [];
  const settingsCbs: ((s: any) => void)[] = [];
  const listenCalls: { event: string; cb: (e: any) => void }[] = [];
  const emitCalls: { event: string; payload: any }[] = [];
  const timerFns = {
    timerResetTask: vi.fn(),
    timerPauseTask: vi.fn(),
    timerResumeTask: vi.fn(),
    timerResetAll: vi.fn(),
    timerToggleTask: vi.fn(),
  };
  const getAppMode = vi.fn();
  const getEntertainmentActive = vi.fn();
  const onAppModeUpdate = vi.fn((cb: any) => {
    appModeCbs.push(cb);
    return Promise.resolve(() => {});
  });
  const onSettingsUpdate = vi.fn((cb: any) => {
    settingsCbs.push(cb);
    return Promise.resolve(() => {});
  });
  const showFloatingWindow = vi.fn(() => Promise.resolve());
  const hideFloatingWindow = vi.fn(() => Promise.resolve());
  const emit = vi.fn((event: string, payload: any) => {
    emitCalls.push({ event, payload });
    return Promise.resolve();
  });
  const listen = vi.fn((event: string, cb: any) => {
    listenCalls.push({ event, cb });
    return Promise.resolve(() => {});
  });
  return {
    appModeCbs,
    settingsCbs,
    listenCalls,
    emitCalls,
    timerFns,
    getAppMode,
    getEntertainmentActive,
    onAppModeUpdate,
    onSettingsUpdate,
    showFloatingWindow,
    hideFloatingWindow,
    emit,
    listen,
  };
});

vi.mock('@/services', () => ({
  getAppMode: mocks.getAppMode,
  getEntertainmentActive: mocks.getEntertainmentActive,
  onAppModeUpdate: mocks.onAppModeUpdate,
  onSettingsUpdate: mocks.onSettingsUpdate,
  showFloatingWindow: mocks.showFloatingWindow,
  hideFloatingWindow: mocks.hideFloatingWindow,
  ...mocks.timerFns,
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: (...args: any[]) => mocks.emit(...args),
  listen: (...args: any[]) => mocks.listen(...args),
}));

beforeEach(() => {
  localStorage.clear();
  useHealthStore.setState(useHealthStore.getInitialState(), true);
  eventCoordinator.clearAll();
  mocks.appModeCbs.length = 0;
  mocks.settingsCbs.length = 0;
  mocks.listenCalls.length = 0;
  mocks.emitCalls.length = 0;
  vi.clearAllMocks();
  mocks.getAppMode.mockResolvedValue('notification');
  mocks.getEntertainmentActive.mockResolvedValue(false);
});

describe('useAppModeSync', () => {
  it('初始化拉取后端模式并同步到 store', async () => {
    useHealthStore.setState({ appMode: 'lock' });
    mocks.getAppMode.mockResolvedValueOnce('floating');
    renderHook(() => useAppModeSync());
    await waitFor(() => expect(useHealthStore.getState().appMode).toBe('floating'));
    expect(useHealthStore.getState().settings.appMode).toBe('floating');
  });

  it('监听 app-mode-changed 同步模式与 floatingDisplayStrategy', () => {
    useHealthStore.setState({ appMode: 'lock' });
    renderHook(() => useAppModeSync());
    expect(mocks.appModeCbs.length).toBeGreaterThan(0);
    act(() => {
      mocks.appModeCbs[0]({ mode: 'notification', displayStrategy: 'always' });
    });
    expect(useHealthStore.getState().appMode).toBe('notification');
    expect(useHealthStore.getState().settings.floatingDisplayStrategy).toBe('always');
  });

  it('监听 settings-updated 同步 appMode', () => {
    useHealthStore.setState({ appMode: 'lock' });
    renderHook(() => useAppModeSync());
    act(() => {
      mocks.settingsCbs[0]({ appMode: 'floating' });
    });
    expect(useHealthStore.getState().appMode).toBe('floating');
  });

  it('监听 entertainment-mode-changed 同步娱乐模式', () => {
    renderHook(() => useAppModeSync());
    const ent = mocks.listenCalls.find((c) => c.event === 'entertainment-mode-changed');
    expect(ent).toBeTruthy();
    act(() => {
      ent!.cb({ payload: { active: true } });
    });
    expect(useHealthStore.getState().entertainmentActive).toBe(true);
  });
});

describe('useModeTransition', () => {
  it('挂載时将 floatingVisible 归位为 false', () => {
    eventCoordinator.floatingVisible = true;
    renderHook(() => useModeTransition());
    expect(eventCoordinator.floatingVisible).toBe(false);
  });

  it('切换到 floating(always) 显示浮窗并发送预览', () => {
    useHealthStore.setState({
      taskStates: {
        sit: { countdown: 100, status: 'running', paused: false, snoozed: false, snooze_remaining: 0, snooze_count: 0 },
      },
    });
    renderHook(() => useModeTransition());
    eventCoordinator.floatingVisible = false;
    act(() => {
      mocks.appModeCbs[0]({ mode: 'floating', displayStrategy: 'always' });
    });
    expect(mocks.showFloatingWindow).toHaveBeenCalled();
    expect(eventCoordinator.floatingVisible).toBe(true);
    expect(mocks.emitCalls.some((c) => c.event === 'floating-preview-update')).toBe(true);
  });

  it('切换到 floating(on-trigger) 不显示浮窗', () => {
    renderHook(() => useModeTransition());
    eventCoordinator.floatingVisible = true;
    act(() => {
      mocks.appModeCbs[0]({ mode: 'floating', displayStrategy: 'on-trigger' });
    });
    expect(eventCoordinator.floatingVisible).toBe(false);
    expect(mocks.showFloatingWindow).not.toHaveBeenCalled();
  });

  it('从 floating 切到其他模式且无预览任务时隐藏浮窗', () => {
    // 所有任务 preNotificationSeconds 置 0 → 无预览任务
    useHealthStore.setState({
      tasks: useHealthStore.getState().tasks.map((t) => ({ ...t, preNotificationSeconds: 0 })),
    });
    renderHook(() => useModeTransition());
    eventCoordinator.floatingVisible = true;
    act(() => {
      mocks.appModeCbs[0]({ mode: 'notification', displayStrategy: 'always' });
    });
    expect(eventCoordinator.floatingVisible).toBe(false);
    expect(mocks.hideFloatingWindow).toHaveBeenCalled();
  });
});
