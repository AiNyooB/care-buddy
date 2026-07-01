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
import { CheckCircle, XCircle } from './Icons';
import { Button } from '@/components/ui/button';
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
  showList,
  currentExerciseId,
}: {
  title: string;
  exerciseList: { id: string; name: string }[];
  showList: boolean;
  currentExerciseId?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="text-center">
      <div className="text-2xl font-semibold text-white mb-3">{title}</div>
      {showList && exerciseList.length > 0 && (
        <div className="text-left max-w-[280px] mx-auto">
          <div className="text-xs uppercase tracking-wider text-white/40 mb-2">
            {t('lock.todayExercises')}
          </div>
          <ul className="space-y-1.5">
            {exerciseList.map((ex) => {
              const isCurrent = ex.id === currentExerciseId;
              return (
                <li
                  key={ex.id}
                  className={
                    isCurrent
                      ? 'text-base text-white font-medium'
                      : 'text-base text-white/50'
                  }
                >
                  <span className="mr-2">•</span>
                  {ex.name}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ContentBody({
  state,
  isExerciseMode,
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
}: {
  state: LockState;
  isExerciseMode: boolean;
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
}) {
  const { t } = useTranslation();

  if (state === 'finished') {
    return (
      <div className="flex flex-col items-center">
        <div className="size-[120px] rounded-full bg-success/20 flex items-center justify-center mb-4">
          <CheckCircle size={72} className="text-success" />
        </div>
        <div className="text-xl font-semibold text-white">
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
        showProgress
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
        <div className="text-base text-white/70 mt-4">
          {fullExerciseIds.length > 1
            ? `${currentExercise.name} (${currentExerciseIndex + 1}/${fullExerciseIds.length})`
            : currentExercise.name}
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
          <Button variant="secondary" onClick={onExit}>
            <XCircle size={20} />
            <span className="ml-1.5">{t('guided.exit')}</span>
          </Button>
        )}
        {canSkip && (
          <Button variant="secondary" onClick={onSkip}>
            <span className="ml-1.5">{t('lock.nextExercise')}</span>
          </Button>
        )}
      </div>
    );
  }

  if (state === 'exercising' && !isExerciseMode) {
    return (
      <div className="flex justify-center gap-3">
        {!strictMode && (
          <Button variant="secondary" onClick={onExit}>
            <XCircle size={20} />
            <span className="ml-1.5">{t('guided.exit')}</span>
          </Button>
        )}
      </div>
    );
  }

  if (state === 'idle') {
    return (
      <div className="flex flex-col items-center gap-3">
        <Button onClick={onStart}>
          <CheckCircle size={20} />
          <span className="ml-1.5">{t('lock.startExercise')}</span>
        </Button>
        {!strictMode && (
          <Button variant="ghost" className="text-white/60" onClick={onExit}>
            <XCircle size={20} />
            <span className="ml-1.5">{t('guided.exit')}</span>
          </Button>
        )}
      </div>
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
      <div className="w-full max-w-[480px] p-8 flex flex-col gap-8 animate-[lockScaleIn_0.35s_ease]">
        <PageTitle
          title={title}
          exerciseList={exerciseList}
          showList={isExerciseMode}
          currentExerciseId={state === 'exercising' || state === 'finished' ? currentExerciseId : undefined}
        />

        <ContentBody
          state={state}
          isExerciseMode={isExerciseMode}
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
        />

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

        {state !== 'idle' && strictMode && (
          <div className="text-center text-white/50 text-sm">
            {t('lock.strictModeHint')}
          </div>
        )}
      </div>
    </div>
  );
}
