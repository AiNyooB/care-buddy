/**
 * 全屏锁屏窗口组件
 * 在独立的 webview 窗口中运行，覆盖整个屏幕显示锁屏 UI。
 *
 * 布局：
 * 1. 页面标题（固定）：任务标题 + 运动列表（锻炼模式）
 * 2. 内容（动态）：引导 UI / 倒计时 / 完成
 * 3. 底部按钮（动态）：主操作
 *
 * 支持两种模式：
 * 1. 普通锁屏：倒计时立即启动
 * 2. 锁屏锻炼：倒计时从用户点 [开始锻炼] 起算，进入引导运动 UI
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { formatDuration } from '../utils/time';
import { playCompleteSound, playCountSound } from '../utils/audio';
import { primeSpeech } from '../services/voice';
import {
  exitLockMode,
  timerSetLockScreenActive,
} from '../services';
import { CheckCircle } from './Icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CircularProgress } from './CircularProgress';
import { exercises } from '../data/exercises';
import { guidedExerciseConfigs } from '../data/guided-configs';
import { useGuidedExercise } from '../hooks/useGuidedExercise';
import { GuidedExerciseContent } from './guided/GuidedExerciseContent';
import type { GuidedConfig } from '../types';

const exerciseById = (id: string) => exercises.find((e) => e.id === id);

function getParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

function parseValidInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type LockState = 'idle' | 'exercising' | 'finished';

function SecondaryScreenHint() {
  const { t } = useTranslation();
  const title = getParam('title') ?? t('lock.title');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm animate-[lockFadeIn_0.3s_ease]">
      <div className="text-center animate-[lockScaleIn_0.35s_ease]">
        <div className="text-2xl font-semibold text-white mb-3">{title}</div>
        <div className="text-base text-white/60">
          {t('lock.lookAtMainDisplay')}
        </div>
      </div>
    </div>
  );
}

function PageTitle({
  title,
  exerciseList,
  state,
  currentExerciseIndex,
  isExerciseMode,
}: {
  title: string;
  exerciseList: { id: string; name: string }[];
  state: LockState;
  currentExerciseIndex: number;
  isExerciseMode: boolean;
}) {
  const isExercising = state === 'exercising';
  const showProgress =
    isExercising && isExerciseMode && exerciseList.length > 1;

  return (
    <div className="text-center">
      <div className="text-sm text-white/60">
        {title}
        {showProgress && (
          <span className="text-white/40">
            {' · '}
            {currentExerciseIndex + 1}/{exerciseList.length}
          </span>
        )}
      </div>
    </div>
  );
}

function ContentBody({
  state,
  isExerciseMode,
  exerciseList,
  currentExercise,
  currentConfig,
  guidedState,
  currentExerciseIndex,
  fullExerciseIds,
  remaining,
  progress,
  hasExercises,
  showExitButton,
  onExit,
  onStart,
}: {
  state: LockState;
  isExerciseMode: boolean;
  exerciseList: { id: string; name: string }[];
  currentExercise: ReturnType<typeof exerciseById> | null;
  currentConfig: GuidedConfig | null;
  guidedState: ReturnType<typeof useGuidedExercise>['state'];
  currentExerciseIndex: number;
  fullExerciseIds: string[];
  remaining: number;
  progress: number;
  hasExercises: boolean;
  showExitButton: boolean;
  onExit: () => void;
  onStart: () => void;
}) {
  const { t } = useTranslation();

  if (state === 'idle' && isExerciseMode) {
    return (
      <div className="flex flex-col items-center gap-8">
        {exerciseList.length > 0 ? (
          <ul className="text-center space-y-2">
            {exerciseList.map((ex, idx) => (
              <li
                key={ex.id}
                className={
                  idx === 0
                    ? 'text-3xl font-medium text-white'
                    : 'text-2xl text-white/70'
                }
              >
                {ex.name}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-base text-white/60">
            {t('lock.noExercises')}
          </div>
        )}
        <Button onClick={onStart} disabled={exerciseList.length === 0}>
          <CheckCircle size={20} />
          <span className="ml-1.5">{t('lock.startExercise')}</span>
        </Button>
      </div>
    );
  }

  if (state === 'finished') {
    return (
      <div className="flex flex-col items-center">
        <div className="size-[140px] rounded-full bg-success/20 flex items-center justify-center mb-6">
          <CheckCircle size={84} className="text-success" />
        </div>
        <div className="text-2xl font-semibold text-white">
          {t('lock.finished')}
        </div>
      </div>
    );
  }

  if (state === 'exercising' && currentExercise && currentConfig) {
    return (
      <GuidedExerciseContent
        exercise={currentExercise}
        guidedState={guidedState}
        guidedConfig={currentConfig}
        showProgress={false}
        currentIndex={currentExerciseIndex}
        totalExercises={fullExerciseIds.length}
        onExit={onExit}
        showExitButton={showExitButton}
      />
    );
  }

  if (state === 'exercising' && isExerciseMode && !hasExercises) {
    return (
      <div className="flex flex-col items-center">
        <CircularProgress size={200} strokeWidth={8} progress={progress}>
          <span className="font-sans text-type-lock-timer font-bold text-white">
            {formatDuration(remaining)}
          </span>
        </CircularProgress>
        <div className="text-base text-white/60 mt-4">
          {t('lock.noExercises')}
        </div>
      </div>
    );
  }

  if (state === 'exercising' && isExerciseMode && currentExercise) {
    return (
      <div className="flex flex-col items-center">
        <CircularProgress size={200} strokeWidth={8} progress={progress}>
          <span className="font-sans text-type-lock-timer font-bold text-white">
            {formatDuration(remaining)}
          </span>
        </CircularProgress>
        <div className="text-lg text-white/80 mt-4">
          {currentExercise.name}
        </div>
      </div>
    );
  }

  if (state === 'exercising') {
    return (
      <CircularProgress size={200} strokeWidth={8} progress={progress}>
        <span className="font-sans text-type-lock-timer font-bold text-white">
          {formatDuration(remaining)}
        </span>
      </CircularProgress>
    );
  }

  return null;
}

function BottomActions({
  state,
  isExerciseMode,
  strictMode,
  autoUnlock,
  canSkip,
  onStart,
  onExit,
  onSkip,
  onComplete,
}: {
  state: LockState;
  isExerciseMode: boolean;
  strictMode: boolean;
  autoUnlock: boolean;
  canSkip: boolean;
  onStart: () => void;
  onExit: () => void;
  onSkip: () => void;
  onComplete: () => void;
}) {
  const { t } = useTranslation();

  if (state === 'finished') {
    return (
      <div className="flex justify-center gap-3">
        {!autoUnlock && (
          <Button onClick={onComplete}>
            <CheckCircle size={20} />
            <span className="ml-1.5">{t('lock.done')}</span>
          </Button>
        )}
      </div>
    );
  }

  if (state === 'exercising' && isExerciseMode) {
    return (
      <div className="flex justify-center gap-3">
        {!strictMode && (
          <Button variant="ghost" className="text-white/60" onClick={onExit}>
            {t('guided.exit')}
          </Button>
        )}
        {canSkip && (
          <Button variant="ghost" className="text-white/60" onClick={onSkip}>
            {t('lock.nextExercise')}
          </Button>
        )}
      </div>
    );
  }

  if (state === 'exercising' && !isExerciseMode) {
    return (
      <div className="flex justify-center gap-3">
        {!strictMode && (
          <Button variant="ghost" className="text-white/60" onClick={onExit}>
            {t('guided.exit')}
          </Button>
        )}
      </div>
    );
  }

  if (state === 'idle') {
    return (
      !strictMode && (
        <Button variant="ghost" className="text-white/60" onClick={onExit}>
          {t('guided.exit')}
        </Button>
      )
    );
  }

  return null;
}

export function LockScreenSlave() {
  const { t } = useTranslation();

  const isPrimary = getParam('is_primary') !== 'false';
  if (!isPrimary) return <SecondaryScreenHint />;

  const title = getParam('title') ?? t('lock.title');
  const duration = parseValidInt(getParam('duration'), 60);
  const strictMode = getParam('strict_mode') === 'true';
  const autoUnlock = getParam('auto_unlock') === 'true';
  const isExerciseMode = getParam('is_exercise_mode') === 'true';
  const exerciseIdsParam = getParam('exercise_ids') ?? '';
  const exerciseIds = exerciseIdsParam ? exerciseIdsParam.split(',').filter(Boolean) : [];

  const [state, setState] = useState<LockState>(isExerciseMode ? 'idle' : 'exercising');
  const [remaining, setRemaining] = useState(isExerciseMode ? 0 : duration);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const completionHandledRef = useRef(false);

  const { state: guidedState, actions: guidedActions } = useGuidedExercise();
  const guidedActionsRef = useRef(guidedActions);
  guidedActionsRef.current = guidedActions;

  const fullExerciseIds = useMemo(
    () => (isExerciseMode ? exerciseIds : []),
    [isExerciseMode, exerciseIds]
  );
  const currentExerciseId = fullExerciseIds[currentExerciseIndex];

  const currentExercise = useMemo(
    () => (currentExerciseId ? exerciseById(currentExerciseId) ?? null : null),
    [currentExerciseId]
  );
  const currentConfig = useMemo(
    () => (currentExerciseId ? guidedExerciseConfigs[currentExerciseId]?.guidedConfig ?? null : null),
    [currentExerciseId]
  );

  const exerciseList = useMemo(
    () =>
      fullExerciseIds
        .map((id) => exerciseById(id))
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .map((e) => ({ id: e.id, name: e.name })),
    [fullExerciseIds]
  );

  const progress = duration > 0 ? (duration - remaining) / duration : 0;
  const canSkip = fullExerciseIds.length >= 2 && currentExerciseIndex < fullExerciseIds.length - 1;
  const hasExercises = fullExerciseIds.length > 0;

  const handleComplete = useCallback(async (playSound = true) => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;
    if (playSound) playCompleteSound();
    guidedActionsRef.current.exit();
    try {
      await emit('lock-screen-completed', { completed: true });
    } catch (e) {
      console.error('emit lock-screen-completed failed:', e);
    }
    try {
      await timerSetLockScreenActive(false);
    } catch (e) {
      console.error('timerSetLockScreenActive failed:', e);
    }
    try {
      await exitLockMode();
    } catch (e) {
      console.error('exitLockMode failed:', e);
    }
  }, []);

  const handleExit = useCallback(async () => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;
    guidedActionsRef.current.exit();
    try {
      await emit('lock-screen-completed', { completed: false });
    } catch (e) {
      console.error('emit lock-screen-completed failed:', e);
    }
    try {
      await timerSetLockScreenActive(false);
    } catch (e) {
      console.error('timerSetLockScreenActive failed:', e);
    }
    try {
      await exitLockMode();
    } catch (e) {
      console.error('exitLockMode failed:', e);
    }
  }, []);

  const handleStartExercise = useCallback(async () => {
    await primeSpeech().catch(() => {});
    setState('exercising');
    setRemaining(duration);
  }, [duration]);

  const handleSkipExercise = useCallback(() => {
    if (canSkip) {
      setCurrentExerciseIndex((i) => i + 1);
    }
  }, [canSkip]);

  useEffect(() => {
    const win = getCurrentWindow();
    win.setFullscreen(true).catch(() => {});
    win.setAlwaysOnTop(true).catch(() => {});
  }, []);

  useEffect(() => {
    if (state === 'idle' || state === 'finished' || completionHandledRef.current) return;

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state === 'exercising' && remaining === 0) {
      setState('finished');
    }
  }, [state, remaining]);

  useEffect(() => {
    if (state === 'finished' && autoUnlock && !completionHandledRef.current) {
      handleComplete(false);
    }
  }, [state, autoUnlock, handleComplete]);

  useEffect(() => {
    if (state !== 'exercising' || remaining <= 0) return;
    if (remaining <= 3) {
      playCountSound();
    }
  }, [remaining, state]);

  useEffect(() => {
    if (state !== 'exercising' || !currentExercise || !currentConfig) return;
    guidedActionsRef.current.startExercise(currentExercise, currentConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, currentExerciseId, currentConfig]);

  useEffect(() => {
    if (guidedState.status !== 'done' || state !== 'exercising') return;
    if (currentExerciseIndex < fullExerciseIds.length - 1) {
      setCurrentExerciseIndex((i) => i + 1);
    }
  }, [guidedState.status, state, currentExerciseIndex, fullExerciseIds.length]);

  useEffect(() => {
    if (state !== 'exercising' || !currentExercise || currentConfig) return;

    const timer = setTimeout(() => {
      if (currentExerciseIndex < fullExerciseIds.length - 1) {
        setCurrentExerciseIndex((i) => i + 1);
      }
    }, 30_000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, currentExerciseId, currentConfig, currentExerciseIndex, fullExerciseIds.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm animate-[lockFadeIn_0.3s_ease]">
      <div className="w-full max-w-[480px] p-8 h-full max-h-[696px] flex flex-col animate-[lockScaleIn_0.35s_ease]">
        <header className="min-h-[60px] flex flex-col justify-center flex-shrink-0">
          <PageTitle
            title={title}
            exerciseList={exerciseList}
            state={state}
            currentExerciseIndex={currentExerciseIndex}
            isExerciseMode={isExerciseMode}
          />
        </header>

        <main className="flex-1 min-h-[280px] flex flex-col items-center justify-center">
          <ContentBody
            state={state}
            isExerciseMode={isExerciseMode}
            exerciseList={exerciseList}
            currentExercise={currentExercise}
            currentConfig={currentConfig}
            guidedState={guidedState}
            currentExerciseIndex={currentExerciseIndex}
            fullExerciseIds={fullExerciseIds}
            remaining={remaining}
            progress={progress}
            hasExercises={hasExercises}
            showExitButton={false}
            onExit={handleExit}
            onStart={handleStartExercise}
          />
        </main>

        <footer className="min-h-[100px] flex flex-col items-center justify-center flex-shrink-0">
          <BottomActions
            state={state}
            isExerciseMode={isExerciseMode}
            strictMode={strictMode}
            autoUnlock={autoUnlock}
            canSkip={canSkip}
            onStart={handleStartExercise}
            onExit={handleExit}
            onSkip={handleSkipExercise}
            onComplete={handleComplete}
          />
        </footer>

        <div className="min-h-[24px] flex items-center justify-center flex-shrink-0">
          {state !== 'idle' && strictMode && (
            <div className="text-center text-sm">
              <span className="text-white/50">{t('lock.strictModeLabel')}</span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="ml-1 text-white/70 underline decoration-dotted underline-offset-4 cursor-help" />
                  }
                >
                  {t('lock.emergencyUnlock')}
                </TooltipTrigger>
                <TooltipContent className="bg-black/90 border border-white/20 text-white">
                  <div className="text-xs whitespace-pre-line">
                    {t('lock.emergencyUnlockTooltip')}
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
