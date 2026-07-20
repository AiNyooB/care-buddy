/**
 * 引导锻炼状态机 Hook
 * 管理 idle → prep → transition → active(step→step) → roundComplete → done 的完整生命周期
 *
 * 改进点：
 * - step 之间自动过渡（transition 阶段 0.5s），不再硬切换
 * - 短动作/beat 模式用节拍音代替 TTS
 * - 长动作在最后3秒给出预告beep
 * - 轮次间有 roundComplete 提示（"第X组"）
 * - TTS 在 transition 阶段提前播报，语音和动作同步
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Exercise, GuidedStep, GuidedConfig } from '../types';
import { speak, stopSpeaking, isSpeechSupported } from '../services/voice';
import { playCompleteSound, playBeatSound, playTransitionSound, playTone } from '../utils/audio';

// ============================================================================
// 状态定义
// ============================================================================

export type GuidedStatus = 'idle' | 'prep' | 'transition' | 'active' | 'roundComplete' | 'done';

export interface GuidedExerciseState {
  status: GuidedStatus;
  currentExercise: Exercise | null;
  guidedConfig: GuidedConfig | null;
  currentCycleStep: number;    // 当前在 cycle 中的索引（0-based）
  currentRepetition: number;   // 当前第几轮（1-based）
  totalRepetitions: number;    // 总轮次
  stepRemaining: number;       // 当前步剩余秒数
  currentStep: GuidedStep | null; // 当前步骤
  prepRemaining: number;       // prep 倒计时剩余秒数
  transitionRemaining: number; // 过渡倒计时剩余秒数
  nextStepPreview: GuidedStep | null; // 预告的下一步
  beatPhase: boolean;          // 节拍相位（true=高音拍，false=低音拍）
  isBeatMode: boolean;         // 当前是否在节拍模式
}

export interface GuidedExerciseActions {
  startExercise: (exercise: Exercise, config: GuidedConfig) => void;
  exit: () => void;
  setMuted: (muted: boolean) => void;
}

interface UseGuidedExerciseReturn {
  state: GuidedExerciseState;
  actions: GuidedExerciseActions;
  isSpeechAvailable: boolean;
}

// ============================================================================
// 常量
// ============================================================================

const PREP_COUNTDOWN_DEFAULT = 3;
const DEFAULT_TRANSITION_DURATION = 0.3;
const ROUND_COMPLETE_DURATION = 0.8;
const SOUND_WARNING_BEEP_FREQ = 800;
const SOUND_WARNING_BEEP_DURATION = 50;
const SOUND_WARNING_BEEP_VOLUME = 0.1;

// ============================================================================
// 初始状态
// ============================================================================

const INITIAL_STATE: GuidedExerciseState = {
  status: 'idle',
  currentExercise: null,
  guidedConfig: null,
  currentCycleStep: 0,
  currentRepetition: 1,
  totalRepetitions: 0,
  stepRemaining: 0,
  currentStep: null,
  prepRemaining: 0,
  transitionRemaining: 0,
  nextStepPreview: null,
  beatPhase: false,
  isBeatMode: false,
};

// ============================================================================
// Hook
// ============================================================================

export function useGuidedExercise(): UseGuidedExerciseReturn {
  const [state, setState] = useState<GuidedExerciseState>(INITIAL_STATE);
  const pausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const isSpeechAvailable = isSpeechSupported();
  const mutedRef = useRef(false);

  // ==========================================================================
  // 工具函数
  // ==========================================================================

  /** 判断一个step是否应该使用节拍模式（不TTS，用beep） */
  const shouldUseBeat = useCallback((step: GuidedStep, config: GuidedConfig): boolean => {
    if (config.beatMode) return true;
    if (step.beat) return true;
    if (step.duration <= 3) return true;
    return false;
  }, []);

  /** 获取step的过渡时间 */
  const getTransitionDuration = useCallback((step: GuidedStep | null, config: GuidedConfig): number => {
    if (!step) return DEFAULT_TRANSITION_DURATION;
    return step.transitionDuration ?? config.transitionDuration ?? DEFAULT_TRANSITION_DURATION;
  }, []);

  // ==========================================================================
  // 清理定时器
  // ==========================================================================

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (prepTimeoutRef.current !== null) {
      clearTimeout(prepTimeoutRef.current);
      prepTimeoutRef.current = null;
    }
    if (transitionTimeoutRef.current !== null) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    if (roundTimeoutRef.current !== null) {
      clearTimeout(roundTimeoutRef.current);
      roundTimeoutRef.current = null;
    }
  }, []);

  // ==========================================================================
  // 进入 active 步骤
  // ==========================================================================

  const startStep = useCallback((cycleStep: number, repetition: number) => {
    const s = stateRef.current;
    const config = s.guidedConfig;
    if (!config) return;

    const step = config.cycle[cycleStep];
    const useBeat = shouldUseBeat(step, config);

    setState((prev) => ({
      ...prev,
      status: 'active',
      currentCycleStep: cycleStep,
      currentRepetition: repetition,
      totalRepetitions: config.repetitions,
      stepRemaining: step.duration,
      currentStep: step,
      prepRemaining: 0,
      transitionRemaining: 0,
      nextStepPreview: null,
      beatPhase: false,
      isBeatMode: useBeat,
    }));

    // 音频/语音
    if (!mutedRef.current) {
      if (useBeat) {
        playBeatSound(true, 0.18);
      } else if (step.duration > 3) {
        speak(step.text);
      }
    }
  }, [shouldUseBeat]);

  // ==========================================================================
  // 进入 transition 阶段
  // ==========================================================================

  const startTransition = useCallback(() => {
    const s = stateRef.current;
    const config = s.guidedConfig;
    if (!config || !s.currentStep) return;

    const currentStepIdx = s.currentCycleStep;
    const nextCycleStep = currentStepIdx + 1;
    const hasNextStep = nextCycleStep < config.cycle.length;
    const hasNextRound = s.currentRepetition < config.repetitions;

    let nextStep: GuidedStep | null = null;
    let transitionSec = getTransitionDuration(s.currentStep, config);

    if (hasNextStep) {
      nextStep = config.cycle[nextCycleStep];
    } else if (hasNextRound) {
      // cycle走完但还有下一轮 → 先到roundComplete，所以这里transition是到roundComplete
      // 但我们先直接进入transition→roundComplete，用短过渡
      nextStep = null;
      transitionSec = 0.3;
    } else {
      // 全部完成 → done
      transitionSec = 0.3;
    }

    // 播放过渡音：下一步有 TTS（长动作）时不再额外播提示音，TTS 本身已是切换信号
    // 下一步无 TTS（短动作/beat 模式）才用 transitionSound
    if (hasNextStep && !mutedRef.current && nextStep) {
      const nextHasTts = !shouldUseBeat(nextStep, config) && nextStep.duration > 3;
      if (!nextHasTts) {
        playTransitionSound();
      }
    }

    setState((prev) => ({
      ...prev,
      status: 'transition',
      transitionRemaining: transitionSec,
      nextStepPreview: nextStep,
      stepRemaining: 0,
    }));
  }, [getTransitionDuration, shouldUseBeat]);

  // ==========================================================================
  // 进入 roundComplete 阶段
  // ==========================================================================

  const startRoundComplete = useCallback((nextRep: number) => {
    const config = stateRef.current.guidedConfig;
    if (!config) return;

    if (!mutedRef.current) {
      speak(`第${nextRep}组`);
    }

    setState((prev) => ({
      ...prev,
      status: 'roundComplete',
      currentRepetition: nextRep,
      currentCycleStep: 0,
      transitionRemaining: ROUND_COMPLETE_DURATION,
      nextStepPreview: config.cycle[0],
      currentStep: null,
      stepRemaining: 0,
    }));
  }, []);

  // ==========================================================================
  // 前进到下一步（从transition结束后调用）
  // ==========================================================================

  const advanceFromTransition = useCallback(() => {
    const s = stateRef.current;
    const config = s.guidedConfig;
    if (!config) return;

    const nextCycleStep = s.currentCycleStep + 1;

    if (nextCycleStep < config.cycle.length) {
      // 同轮内下一步
      startStep(nextCycleStep, s.currentRepetition);
    } else {
      // 当前轮结束
      const nextRepetition = s.currentRepetition + 1;
      if (nextRepetition > config.repetitions) {
        // 全部完成
        if (!mutedRef.current) playCompleteSound();
        setState((prev) => ({
          ...prev,
          status: 'done',
          currentStep: null,
          stepRemaining: 0,
          transitionRemaining: 0,
          nextStepPreview: null,
        }));
      } else {
        // 进入下一轮前先 roundComplete
        startRoundComplete(nextRepetition);
      }
    }
  }, [startStep, startRoundComplete]);

  // ==========================================================================
  // 启动计时器
  // ==========================================================================

  const startTimer = useCallback(() => {
    clearTimer();
    // 250ms tick：active 阶段每秒整数减法足够；transition 阶段 0.1s 精度仍能正确触发 <= 0 判定
    // （实际过渡时长比配置值多 0-250ms，可接受）
    const TICK_MS = 250;
    let tickAccum = 0;

    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      tickAccum += TICK_MS;

      const s = stateRef.current;

      // ── prep 阶段（整秒倒计时） ──
      if (s.status === 'prep') {
        if (tickAccum < 1000) return;
        tickAccum = 0;

        // prepCountdown 守卫：prep=0 或 prepRemaining 已耗尽时立即进入第一步，不播报 "0"
        const prepCountdown = s.guidedConfig?.prepCountdown ?? PREP_COUNTDOWN_DEFAULT;
        if (prepCountdown <= 0 || s.prepRemaining <= 0) {
          startStep(0, 1);
          return;
        }

        if (s.prepRemaining <= 1) {
          if (!mutedRef.current) speak(String(s.prepRemaining));
          setState((prev) => ({ ...prev, prepRemaining: 0 }));
          prepTimeoutRef.current = setTimeout(() => {
            prepTimeoutRef.current = null;
            const s2 = stateRef.current;
            if (!s2.currentExercise || s2.status !== 'prep') return;
            // prep结束 → 进入第一个step（不需要transition，prep本身就是准备）
            startStep(0, 1);
          }, 700);
          return;
        }

        if (!mutedRef.current) speak(String(s.prepRemaining));
        setState((prev) => ({ ...prev, prepRemaining: prev.prepRemaining - 1 }));
        return;
      }

      // ── transition 阶段（0.5-2秒，用100ms精度倒计时） ──
      if (s.status === 'transition') {
        if (tickAccum < TICK_MS) return;
        tickAccum = 0;

        const next = Math.max(0, s.transitionRemaining - TICK_MS / 1000);
        if (next <= 0) {
          advanceFromTransition();
          return;
        }
        setState((prev) => ({ ...prev, transitionRemaining: Math.round(next * 10) / 10 }));
        return;
      }

      // ── roundComplete 阶段 ──
      if (s.status === 'roundComplete') {
        if (tickAccum < TICK_MS) return;
        tickAccum = 0;

        const next = Math.max(0, s.transitionRemaining - TICK_MS / 1000);
        if (next <= 0) {
          // roundComplete结束 → transition(0.3s) → 下一轮第一步
          const s2 = stateRef.current;
          const config = s2.guidedConfig;
          if (!config) return;

          // 直接进入下一轮第一步（roundComplete本身已经是过渡）
          startStep(0, s2.currentRepetition);
          return;
        }
        setState((prev) => ({ ...prev, transitionRemaining: Math.round(next * 10) / 10 }));
        return;
      }

      // ── active 阶段 ──
      if (s.status === 'active') {
        if (tickAccum < 1000) return;
        tickAccum = 0;

        if (s.stepRemaining <= 0) return;

        // 3秒预告beep（长动作最后3秒）
        if (!s.isBeatMode && s.stepRemaining === 3 && (s.currentStep?.duration ?? 0) > 5 && !mutedRef.current) {
          playTone(SOUND_WARNING_BEEP_FREQ, SOUND_WARNING_BEEP_DURATION, 'sine', SOUND_WARNING_BEEP_VOLUME);
        }

        const nextRemaining = s.stepRemaining - 1;
        if (nextRemaining <= 0) {
          // step结束 → 进入transition
          startTransition();
          return;
        }
        setState((prev) => ({ ...prev, stepRemaining: nextRemaining }));
      }
    }, TICK_MS);
  }, [clearTimer, startStep, startTransition, advanceFromTransition]);

  // ==========================================================================
  // Actions
  // ==========================================================================

  const startExercise = useCallback((exercise: Exercise, config: GuidedConfig) => {
    if (!config || config.cycle.length === 0) {
      return;
    }

    const prepCountdown = config.prepCountdown ?? PREP_COUNTDOWN_DEFAULT;

    setState({
      ...INITIAL_STATE,
      status: 'prep',
      currentExercise: exercise,
      guidedConfig: config,
      currentCycleStep: 0,
      currentRepetition: 1,
      totalRepetitions: config.repetitions,
      stepRemaining: 0,
      currentStep: null,
      prepRemaining: prepCountdown,
    });
    pausedRef.current = false;
  }, []);

  const exit = useCallback(() => {
    clearTimer();
    stopSpeaking();
    setState(INITIAL_STATE);
    pausedRef.current = false;
  }, [clearTimer]);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    if (muted) stopSpeaking();
  }, []);

  // ==========================================================================
  // 启动 / 停止计时器
  // ==========================================================================

  useEffect(() => {
    if (state.status === 'prep' || state.status === 'active' || state.status === 'transition' || state.status === 'roundComplete') {
      startTimer();
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [state.status, startTimer, clearTimer]);

  // ==========================================================================
  // 组件卸载时清理
  // ==========================================================================

  useEffect(() => {
    return () => {
      clearTimer();
      stopSpeaking();
    };
  }, [clearTimer]);

  return {
    state,
    actions: { startExercise, exit, setMuted },
    isSpeechAvailable,
  };
}
