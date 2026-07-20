/**
 * 音效工具（Web Audio API）
 * 使用 Web Audio API 生成简单音效，无需外部音频文件
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/**
 * 播放单音
 */
export function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.3
): void {
  try {
    const ctx = getAudioContext();

    // 如果 AudioContext 被暂停，需要先恢复
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    // 淡入淡出避免爆音
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, now + duration / 1000);

    oscillator.start(now);
    oscillator.stop(now + duration / 1000);
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}

/**
 * 播放计数音（短促提示）
 */
export function playCountSound(): void {
  playTone(800, 100, 'sine', 0.25);
}

/**
 * 播放完成音（上升和弦）
 */
export function playCompleteSound(): void {
  playTone(523, 150, 'sine', 0.3); // C5
  setTimeout(() => playTone(659, 150, 'sine', 0.3), 150); // E5
  setTimeout(() => playTone(784, 250, 'sine', 0.3), 300); // G5
}

/**
 * 播放开始音
 */
export function playStartSound(): void {
  playTone(440, 200, 'sine', 0.25); // A4
}

/**
 * 播放警告音（急促）
 */
export function playWarningSound(): void {
  playTone(600, 150, 'square', 0.2);
  setTimeout(() => playTone(600, 150, 'square', 0.2), 200);
}

/**
 * 播放节拍音（清脆高音，用于快速动作节奏提示）
 */
export function playBeatSound(high = true, volume = 0.2): void {
  playTone(high ? 1200 : 900, 60, 'triangle', volume);
}

/**
 * 播放过渡音（轻柔双音，用于step切换预告）
 */
export function playTransitionSound(): void {
  playTone(660, 80, 'sine', 0.15);
  setTimeout(() => playTone(880, 80, 'sine', 0.15), 80);
}

/**
 * 播放轮次提示音（中音，用于"第X组"提示）
 */
export function playRoundSound(): void {
  playTone(523, 200, 'sine', 0.2);
}

/**
 * 播放取消音
 */
export function playCancelSound(): void {
  playTone(400, 200, 'sine', 0.2);
  setTimeout(() => playTone(300, 300, 'sine', 0.2), 150);
}

/**
 * 静音（用户按下静音键时调用）
 */
export function muteAudio(): void {
  if (audioContext) {
    audioContext.suspend();
  }
}

/**
 * 取消静音
 */
export function unmuteAudio(): void {
  if (audioContext) {
    audioContext.resume();
  }
}

// HMR 防护：模块替换时关闭旧 AudioContext，避免泄漏
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (audioContext && audioContext.state !== 'closed') {
      try { audioContext.close(); } catch { /* ignore */ }
    }
    audioContext = null;
  });
}
