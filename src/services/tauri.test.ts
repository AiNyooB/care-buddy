// @vitest-environment jsdom
/**
 * tauri 服务单元测试
 *
 * 通过 vi.mock 拦截 @tauri-apps 的 core / event / 插件模块，
 * 验证：非 Tauri 环境的优雅降级、onCountdownUpdate 的 payload 转换、
 * syncTasks 的字段命名映射、invoke 的回调错误吞掉逻辑。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/types';

// 用 vi.hoisted 提升 mock 对象，避免 TDZ（vi.mock 工厂会被提升到文件顶部）
const { invokeMock, listenMock, emitMock, autostartMock, notificationMock, listenCalls } = vi.hoisted(() => {
  const listenCalls: { event: string; handler: (e: any) => void }[] = [];
  const invokeMock = vi.fn();
  const listenMock = vi.fn((event: string, handler: (e: any) => void) => {
    listenCalls.push({ event, handler });
    return Promise.resolve(() => {});
  });
  const emitMock = vi.fn();
  const autostartMock = { enable: vi.fn(), disable: vi.fn(), isEnabled: vi.fn() };
  const notificationMock = { isPermissionGranted: vi.fn(), requestPermission: vi.fn() };
  return { invokeMock, listenMock, emitMock, autostartMock, notificationMock, listenCalls };
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: any[]) => invokeMock(...args) }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: any[]) => listenMock(...args),
  emit: (...args: any[]) => emitMock(...args),
}));
vi.mock('@tauri-apps/plugin-autostart', () => autostartMock);
vi.mock('@tauri-apps/plugin-notification', () => notificationMock);

import {
  invoke,
  listen,
  onCountdownUpdate,
  syncTasks,
  getAppMode,
} from '@/services/tauri';

function setTauri(on: boolean) {
  if (on) {
    (window as any).__TAURI_INTERNALS__ = {};
  } else {
    delete (window as any).__TAURI_INTERNALS__;
  }
}

const sampleTask: Task = {
  id: 'sit',
  title: '坐姿',
  desc: '',
  interval: 30,
  enabled: true,
  icon: 'sit',
  autoResetOnIdle: true,
  preNotificationSeconds: 5,
  snoozeMinutes: 5,
  scheduleType: 'interval',
  dailyTime: null,
};

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockClear();
  emitMock.mockClear();
  listenCalls.length = 0;
  invokeMock.mockResolvedValue(undefined);
});

describe('tauri - 非 Tauri 环境降级', () => {
  beforeEach(() => setTauri(false));

  it('invoke 在非 Tauri 环境 reject', async () => {
    await expect(invoke('any')).rejects.toThrow('Tauri IPC not available');
  });

  it('onCountdownUpdate 返回 noop 且回调不被调用', async () => {
    const handler = vi.fn();
    const unlisten = await onCountdownUpdate(handler);
    expect(typeof unlisten).toBe('function');
    expect(handler).not.toHaveBeenCalled();
    expect(listenMock).not.toHaveBeenCalled();
  });
});

describe('tauri - Tauri 环境下的转换/映射', () => {
  beforeEach(() => setTauri(true));

  it('invoke 在 Tauri 环境走真实 tauriInvoke', async () => {
    invokeMock.mockResolvedValueOnce('ok');
    const r = await getAppMode();
    expect(r).toBe('ok');
    expect(invokeMock.mock.calls[0][0]).toBe('get_app_mode');
  });

  it('invoke 吞掉 callback id 过期错误', async () => {
    invokeMock.mockRejectedValueOnce(new Error('something about callback id 123'));
    await expect(invoke('sync_tasks')).resolves.toBeUndefined();
  });

  it('invoke 透传其它错误', async () => {
    invokeMock.mockRejectedValueOnce(new Error('real failure'));
    await expect(invoke('sync_tasks')).rejects.toThrow('real failure');
  });

  it('onCountdownUpdate 将数组 payload 转为 Record 并传递娱乐倒计时', async () => {
    const handler = vi.fn();
    await onCountdownUpdate(handler);
    expect(listenMock).toHaveBeenCalledWith('countdown-update', expect.any(Function));

    const captured = listenCalls.find((c) => c.event === 'countdown-update')!;
    captured.handler({
      payload: {
        tasks: [
          { id: 'sit', remaining: 100, total: 120, enabled: true, task_paused: false, snoozed: false, snooze_remaining: 0, snooze_count: 0, triggered: false },
          { id: 'water', remaining: 0, total: 60, enabled: true, task_paused: false, snoozed: false, snooze_remaining: 0, snooze_count: 0, triggered: true },
        ],
        entertainment: { remaining: 50, total: 60 },
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const [countdowns, entertainment] = handler.mock.calls[0];
    expect(countdowns['sit'].remaining).toBe(100);
    expect(countdowns['water'].triggered).toBe(true);
    expect(entertainment).toEqual({ remaining: 50, total: 60 });
  });

  it('onCountdownUpdate 兼容旧版纯数组 payload（娱乐倒计时为 null）', async () => {
    const handler = vi.fn();
    await onCountdownUpdate(handler);
    const captured = listenCalls.find((c) => c.event === 'countdown-update')!;
    captured.handler({ payload: [{ id: 'eye', remaining: 10, total: 20, enabled: true, task_paused: false, snoozed: false, snooze_remaining: 0, snooze_count: 0, triggered: false }] });
    const [countdowns, entertainment] = handler.mock.calls[0];
    expect(countdowns['eye'].id).toBe('eye');
    expect(entertainment).toBeNull();
  });

  it('syncTasks 将 camelCase 字段映射为后端 snake_case', async () => {
    await syncTasks([sampleTask]);
    expect(invokeMock).toHaveBeenCalledWith('sync_tasks', expect.anything());
    const arg = invokeMock.mock.calls[0][1];
    const mapped = arg.tasks[0];
    expect(mapped.auto_reset_on_idle).toBe(true);
    expect(mapped.lock_duration).toBe(60); // 默认值
    expect(mapped.exercise_ids).toBeNull();
    expect(mapped.schedule_type).toBe('interval');
    expect(mapped.daily_time).toBeNull();
  });

  it('listen 包装在非 Tauri 环境返回 noop、Tauri 环境返回真实 unlisten', async () => {
    const un = await listen('x', () => {});
    expect(typeof un).toBe('function');
  });
});
