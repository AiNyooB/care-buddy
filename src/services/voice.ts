/**
 * 语音引导服务
 * 基于 Web Speech API 的 TTS 封装
 */

let currentUtterance: SpeechSynthesisUtterance | null = null;
let primed = false;
let voicesReady: Promise<void> | null = null;

// 尽早触发 Chrome 异步加载语音列表
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
}

/**
 * 等待语音列表加载完成（Chrome 异步加载，getVoices() 首次调用返回空数组）
 */
function ensureVoices(): Promise<void> {
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve();
      return;
    }
    speechSynthesis.addEventListener('voiceschanged', () => resolve(), { once: true });
    speechSynthesis.getVoices();
    setTimeout(resolve, 3000);
  });
  return voicesReady;
}

/**
 * 在用户手势中激活 speech 权限 + 等待语音加载，确保后续 speak() 可用
 * 必须在 click/tap 事件中调用（可 await）
 */
export async function primeSpeech(): Promise<void> {
  if (primed) return;
  if (!('speechSynthesis' in window)) return;
  await ensureVoices();
  try {
    const warmup = new SpeechSynthesisUtterance(' ');
    warmup.volume = 0;
    speechSynthesis.speak(warmup);
    primed = true;
  } catch (e) {
    console.warn('[voice] primeSpeech failed, will retry on next speak:', e);
    // 重置 voicesReady 以便下次 primeSpeech/speak 能重新尝试加载语音
    voicesReady = null;
  }
}

/**
 * 播报文本
 */
export function speak(text: string, lang = 'zh-CN'): void {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.85;
  utterance.pitch = 1.0;
  utterance.volume = 0.8;
  currentUtterance = utterance;
  try {
    speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('[voice] speak() failed:', e);
  }
}

/**
 * 停止所有语音播报
 */
export function stopSpeaking(): void {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  currentUtterance = null;
}

/**
 * Web Speech API 是否可用
 */
export function isSpeechSupported(): boolean {
  return 'speechSynthesis' in window;
}

// HMR 防护：模块替换时清理语音状态，避免 primed/voicesReady 残留导致后续 speak 不工作
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    currentUtterance = null;
    primed = false;
    voicesReady = null;
    if ('speechSynthesis' in window) {
      try { speechSynthesis.cancel(); } catch { /* ignore */ }
    }
  });
}
