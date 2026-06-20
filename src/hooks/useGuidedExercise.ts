/**
 * 引导锻炼状态机 Hook
 * 管理 prep → active(step→step) → done 的完整生命周期
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Exercise, GuidedStep, GuidedConfig } from '../types';
import { speak, stopSpeaking, isSpeechSupported } from '../services/voice';
import { playCountSound } from '../utils/audio';

// ============================================================================
// 状态定义
// ============================================================================

export type GuidedStatus = 'idle' | 'prep' | 'active' | 'done';

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
};

// ============================================================================
// Hook
// ============================================================================

export function useGuidedExercise(): UseGuidedExerciseReturn {
  const [state, setState] = useState<GuidedExerciseState>(INITIAL_STATE);
  const pausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Bug N6: 存储 startTimer 内的 setTimeout id，在 clearTimer 中清理
  const prepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const isSpeechAvailable = isSpeechSupported();
  const isTransitionScheduledRef = useRef(false);
  const advancePendingRef = useRef(false);
  const mutedRef = useRef(false);

  // ==========================================================================
  // 清理定时器
  // ==========================================================================

  const clearTimer = useCallback(() => {
    isTransitionScheduledRef.current = false;
    advancePendingRef.current = false;
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (prepTimeoutRef.current !== null) {
      clearTimeout(prepTimeoutRef.current);
      prepTimeoutRef.current = null;
    }
    if (advanceTimeoutRef.current !== null) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }
  }, []);

  // ==========================================================================
  // 进入下一轮 prep
  // ==========================================================================

  const startPrep = useCallback((exercise: Exercise, prepCountdown: number) => {
    setState((prev) => ({
      ...prev,
      status: 'prep',
      prepRemaining: prepCountdown,
    }));
  }, []);

  // ==========================================================================
  // 进入 active 步骤
  // ==========================================================================

  const startStep = useCallback((cycleStep: number, repetition: number) => {
    const s = stateRef.current;
    const config = s.guidedConfig!;
    const step = config.cycle[cycleStep];
    setState((prev) => ({
      ...prev,
      status: 'active',
      currentCycleStep: cycleStep,
      currentRepetition: repetition,
      totalRepetitions: config.repetitions,
      stepRemaining: step.duration,
      currentStep: step,
      prepRemaining: 0,
    }));
    if (!mutedRef.current) speak(step.text);
  }, []);

  // ==========================================================================
  // 前进到下一步
  // ==========================================================================

  const advance = useCallback(() => {
    const s = stateRef.current;
    const config = s.guidedConfig;
    if (!config) return;

    const nextCycleStep = s.currentCycleStep + 1;
    if (nextCycleStep < config.cycle.length) {
      // 同一轮内的下一步 → 跳过 prep，直接进入步骤
      startStep(nextCycleStep, s.currentRepetition);
    } else {
      // 当前轮结束
      const nextRepetition = s.currentRepetition + 1;
      if (nextRepetition > config.repetitions) {
        // 所有轮次完成 → 播放结束提示音
        playCountSound();
        setState((prev) => ({
          ...prev,
          status: 'done',
          currentStep: null,
          stepRemaining: 0,
        }));
      } else {
        // 下一轮 → 从 cycle[0] 开始（跳过 prep）
        startStep(0, nextRepetition);
      }
    }
  }, [startStep]);

  // ==========================================================================
  // 启动计时器
  // ==========================================================================

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setInterval(() => {
      const s = stateRef.current;

      if (pausedRef.current) return;

      if (s.status === 'prep') {
        if (isTransitionScheduledRef.current) return;

        if (s.prepRemaining <= 1) {
          // 最后一位数：先念完再 transition
          if (!mutedRef.current) speak(String(s.prepRemaining));
          isTransitionScheduledRef.current = true;
          setState((prev) => ({ ...prev, prepRemaining: 0 }));
          prepTimeoutRef.current = setTimeout(() => {
            prepTimeoutRef.current = null;
            isTransitionScheduledRef.current = false;
            const s2 = stateRef.current;
            if (!s2.currentExercise || s2.status !== 'prep') return;
            playCountSound();
            startStep(s2.currentCycleStep, s2.currentRepetition);
          }, 700);
          return;
        }

        if (!mutedRef.current) speak(String(s.prepRemaining));
        setState((prev) => ({ ...prev, prepRemaining: prev.prepRemaining - 1 }));
      } else if (s.status === 'active') {
        if (s.stepRemaining <= 0 || advancePendingRef.current) return;
        setState((prev) => {
          const next = prev.stepRemaining - 1;
          if (next <= 0) {
            advancePendingRef.current = true;
            advanceTimeoutRef.current = setTimeout(() => {
              advanceTimeoutRef.current = null;
              advancePendingRef.current = false;
              advance();
            }, 0);
            return { ...prev, stepRemaining: 0 };
          }
          return { ...prev, stepRemaining: next };
        });
      }
    }, 1000);
  }, [clearTimer, advance, startStep]);

  // ==========================================================================
  // Actions
  // ==========================================================================

  const startExercise = useCallback((exercise: Exercise, config: GuidedConfig) => {
    if (!config || config.cycle.length === 0) {
      return;
    }

    const prepCountdown = config.prepCountdown ?? PREP_COUNTDOWN_DEFAULT;

    setState({
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
    if (state.status === 'prep' || state.status === 'active') {
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