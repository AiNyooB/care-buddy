// @vitest-environment jsdom
/**
 * audio 单元测试
 *
 * 注入 window.AudioContext 桩，验证 playTone 的振荡器/增益节点创建与
 * start/stop 调用，以及 muteAudio/unmuteAudio 对上下文的挂起/恢复。
 * 含 setTimeout 的音效用 fake timers 触发完整链路。
 *
 * 由于 audio.ts 内部缓存了模块级 audioContext 单例，每个用例通过
 * vi.resetModules() + 动态 import 获得全新模块，避免上下文跨用例泄漏。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let ctxInstances: any[] = [];

function installAudio() {
  ctxInstances = [];
  const Ctor = vi.fn(() => {
    const ctx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: vi.fn(),
      suspend: vi.fn(),
      close: vi.fn(),
      createOscillator: vi.fn(() => ({
        frequency: { value: 0 },
        type: '',
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
    };
    ctxInstances.push(ctx);
    return ctx;
  });
  (window as any).AudioContext = Ctor;
  (globalThis as any).AudioContext = Ctor;
}

beforeEach(() => {
  installAudio();
  vi.resetModules(); // 让下次动态 import 重新执行 audio.ts，重置模块级单例
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as any).AudioContext;
  delete (globalThis as any).AudioContext;
});

describe('audio - playTone 链路', () => {
  it('创建振荡器与增益节点并连接、start/stop', async () => {
    const audio = await import('@/utils/audio');
    audio.playTone(440, 200, 'sine', 0.25);
    expect((window as any).AudioContext).toHaveBeenCalledTimes(1);
    const ctx = ctxInstances[0];
    expect(ctx.createOscillator).toHaveBeenCalled();
    const osc = ctx.createOscillator.mock.results[0].value;
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
    const gain = ctx.createGain.mock.results[0].value;
    expect(gain.gain.setValueAtTime).toHaveBeenCalled();
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalled();
  });

  it('playCountSound / playStartSound 各触发一次振荡器（共用同一上下文）', async () => {
    const audio = await import('@/utils/audio');
    audio.playCountSound();
    audio.playStartSound();
    // 两个音效复用缓存的同一 AudioContext 实例
    expect(ctxInstances[0].createOscillator).toHaveBeenCalledTimes(2);
  });
});

describe('audio - 步进/和弦音效（setTimeout）', () => {
  it('playCompleteSound 在真实上下文中共播放 3 个音', async () => {
    vi.useFakeTimers();
    const audio = await import('@/utils/audio');
    audio.playCompleteSound();
    vi.runAllTimers();
    // 立即播放 1 个 + 两个 setTimeout 各 1 个
    expect(ctxInstances[0].createOscillator).toHaveBeenCalledTimes(3);
  });
});

describe('audio - 静音控制', () => {
  it('muteAudio 挂起、unmuteAudio 恢复上下文', async () => {
    const audio = await import('@/utils/audio');
    audio.playTone(440, 100); // 建立 audioContext
    const ctx = ctxInstances[0];
    audio.muteAudio();
    expect(ctx.suspend).toHaveBeenCalled();
    audio.unmuteAudio();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('muteAudio 在上下文未创建时不抛错', async () => {
    const audio = await import('@/utils/audio');
    expect(() => audio.muteAudio()).not.toThrow();
    expect(() => audio.unmuteAudio()).not.toThrow();
  });
});
