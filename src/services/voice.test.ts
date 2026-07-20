// @vitest-environment jsdom
/**
 * voice 服务单元测试
 *
 * 在 jsdom 中注入 window.speechSynthesis / SpeechSynthesisUtterance 的桩，
 * 验证 speak / stopSpeaking / primeSpeech / isSpeechSupported 的行为与字段映射。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 全局桩状态
let mockSpeak: ReturnType<typeof vi.fn>;
let mockCancel: ReturnType<typeof vi.fn>;
let mockGetVoices: ReturnType<typeof vi.fn>;

function installSpeech() {
  mockSpeak = vi.fn();
  mockCancel = vi.fn();
  mockGetVoices = vi.fn(() => []);
  const synth = {
    speak: mockSpeak,
    cancel: mockCancel,
    getVoices: mockGetVoices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  (window as any).speechSynthesis = synth;
  (window as any).SpeechSynthesisUtterance = class {
    text = '';
    lang = '';
    rate = 1;
    pitch = 1;
    volume = 1;
    constructor(t: string) {
      this.text = t;
    }
  };
}

import {
  speak,
  stopSpeaking,
  primeSpeech,
  isSpeechSupported,
} from '@/services/voice';

beforeEach(() => {
  installSpeech();
});

afterEach(() => {
  delete (window as any).speechSynthesis;
  delete (window as any).SpeechSynthesisUtterance;
});

describe('voice - 支持时', () => {
  it('isSpeechSupported 为 true', () => {
    expect(isSpeechSupported()).toBe(true);
  });

  it('speak 取消旧播报并以正确文本/语言创建新播报', () => {
    speak('你好世界', 'zh-CN');
    expect(mockCancel).toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const utt = mockSpeak.mock.calls[0][0];
    expect(utt.text).toBe('你好世界');
    expect(utt.lang).toBe('zh-CN');
    expect(utt.rate).toBe(0.85);
    expect(utt.volume).toBe(0.8);
  });

  it('speak 默认语言为 zh-CN', () => {
    speak('hi');
    expect(mockSpeak.mock.calls[0][0].lang).toBe('zh-CN');
  });

  it('stopSpeaking 取消播报', () => {
    speak('x');
    stopSpeaking();
    expect(mockCancel).toHaveBeenCalledTimes(2); // speak 内一次 + stopSpeaking 一次
  });

  it('primeSpeech 等待语音加载后标记就绪，不抛错', async () => {
    await expect(primeSpeech()).resolves.toBeUndefined();
  });
});

describe('voice - 不支持时', () => {
  beforeEach(() => {
    delete (window as any).speechSynthesis;
    delete (window as any).SpeechSynthesisUtterance;
  });

  it('isSpeechSupported 为 false', () => {
    expect(isSpeechSupported()).toBe(false);
  });

  it('speak 不调用底层 API', () => {
    // 重新安装临时桩以观察是否被调用
    installSpeech();
    const spySpeak = mockSpeak;
    delete (window as any).speechSynthesis;
    speak('应被忽略');
    expect(spySpeak).not.toHaveBeenCalled();
  });
});
