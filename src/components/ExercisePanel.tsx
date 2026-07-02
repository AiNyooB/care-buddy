import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { CheckCircle, XCircle, ChevronRight, Volume2, VolumeX } from './Icons';
import { Button } from '@/components/ui/button';
import { exercises, exercisePackages } from '../data/exercises';
import { guidedExerciseConfigs } from '../data/guided-configs';
import { useGuidedExercise } from '../hooks/useGuidedExercise';
import { GuidedExerciseContent } from './guided/GuidedExerciseContent';
import type { Exercise } from '../types';

// ============================================================================
// GuidedSingleExercisePanel — 全屏 overlay 包装（单卡片入口）
// ============================================================================

function GuidedSingleExercisePanel({ exercise, onComplete, onExit }: {
  exercise: Exercise;
  onComplete: (exercise: Exercise) => void;
  onExit: () => void;
}) {
  const { t } = useTranslation();
  const { state: guidedState, actions: guidedActions } = useGuidedExercise();
  const guidedConfig = guidedExerciseConfigs[exercise.id]?.guidedConfig;
  const [muted, setMuted] = useState(false);
  const completionHandledRef = useRef(false);

  useEffect(() => {
    if (!guidedConfig) return;
    completionHandledRef.current = false;
    guidedActions.startExercise(exercise, guidedConfig);
  }, [exercise.id]);

  useEffect(() => {
    if (guidedState.status === 'done' && !completionHandledRef.current) {
      completionHandledRef.current = true;
      const timer = setTimeout(() => onComplete(exercise), 1500);
      return () => clearTimeout(timer);
    }
  }, [guidedState.status]);

  const handleToggleMuted = () => {
    const next = !muted;
    setMuted(next);
    guidedActions.setMuted(next);
  };

  const handleExit = () => {
    guidedActions.exit();
    onExit();
  };

  if (!guidedConfig) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm animate-[lockFadeIn_0.3s_ease]">
      <button
        className="absolute right-6 top-6 z-10 text-white/60 hover:text-white"
        onClick={handleToggleMuted}
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX size={24} /> : <Volume2 size={24} />}
      </button>

      <div className="w-full max-w-[480px] p-8">
        <GuidedExerciseContent
          exercise={exercise}
          guidedState={guidedState}
          guidedConfig={guidedConfig}
          onExit={handleExit}
        />
      </div>
    </div>
  );
}

// ============================================================================
// StaticExerciseContent — 纯内容渲染，无 overlay/按钮
// ============================================================================

function StaticExerciseContent({ exercise }: { exercise: Exercise }) {
  const { t } = useTranslation();
  return (
    <div className="text-center animate-[lockScaleIn_0.35s_ease]">
      <div className="truncate text-3xl font-bold text-white mb-2 drop-shadow-lg">{exercise.name}</div>
      <div className="text-sm text-white/60 mb-4 uppercase tracking-wider">{t('categories.' + exercise.category)}</div>
      <div className="text-base text-white/80 mb-6 leading-relaxed">{exercise.description}</div>

      <div className="text-left bg-white/10 rounded-xl p-4 mb-5">
        <div className="text-sm font-semibold text-white/90 mb-2">{t('exercise.instructions')}</div>
        <div className="text-[15px] text-white/80 leading-relaxed">{exercise.instructions}</div>
      </div>

      {exercise.repetitions && (
        <div className="flex items-center justify-center gap-2 mb-3 text-lg font-semibold">
          <span className="text-white/70 text-[15px] font-medium">{t('exercise.repetitions')}:</span>
          <span className="text-success text-xl">{exercise.repetitions}</span>
        </div>
      )}
      {exercise.holdTime && (
        <div className="flex items-center justify-center gap-2 mb-3 text-lg font-semibold">
          <span className="text-white/70 text-[15px] font-medium">{t('exercise.holdTime')}:</span>
          <span className="text-success text-xl">{exercise.holdTime}s</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// GuidedExerciseWrapper — 引导模式钩子包装（每个运动独立实例，供 PackageExerciser 使用）
// ============================================================================

interface GuidedExerciseWrapperProps {
  exercise: Exercise;
  muted: boolean;
  onComplete: (exercise: Exercise) => void;
}

function GuidedExerciseWrapper({ exercise, muted, onComplete }: GuidedExerciseWrapperProps) {
  const { state: guidedState, actions: guidedActions } = useGuidedExercise();
  const guidedConfig = guidedExerciseConfigs[exercise.id]?.guidedConfig;
  const completionHandledRef = useRef(false);

  useEffect(() => {
    guidedActions.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    if (!guidedConfig) return;
    completionHandledRef.current = false;
    guidedActions.startExercise(exercise, guidedConfig);
  }, [exercise.id]);

  useEffect(() => {
    if (guidedState.status === 'done' && !completionHandledRef.current) {
      completionHandledRef.current = true;
      const timer = setTimeout(() => onComplete(exercise), 800);
      return () => clearTimeout(timer);
    }
  }, [guidedState.status]);

  if (!guidedConfig) return null;

  return (
    <GuidedExerciseContent
      exercise={exercise}
      guidedState={guidedState}
      guidedConfig={guidedConfig}
    />
  );
}

// ============================================================================
// PackageExerciser — 套餐遍历，持久 overlay + 运动间过渡
// ============================================================================

function PackageExerciser({ packageId }: { packageId: string }) {
  const { t } = useTranslation();
  const pkg = exercisePackages.find((p) => p.id === packageId)!;
  const currentIndex = useHealthStore((s) => s.exercisePanel.currentIndex);
  const advanceExercise = useHealthStore((s) => s.advanceExercise);
  const closeExercisePanel = useHealthStore((s) => s.closeExercisePanel);
  const incrementExercisesCompleted = useHealthStore((s) => s.incrementExercisesCompleted);
  const incrementCategoryExercise = useHealthStore((s) => s.incrementCategoryExercise);
  const incrementPackagesCompleted = useHealthStore((s) => s.incrementPackagesCompleted);
  const incrementPackageCompleteCount = useHealthStore((s) => s.incrementPackageCompleteCount);
  const addExerciseMinutes = useHealthStore((s) => s.addExerciseMinutes);

  const totalExercises = pkg.exercises.length;
  const isLast = currentIndex + 1 >= totalExercises;
  const [phase, setPhase] = useState<'exercising' | 'transition' | 'done'>('exercising');
  const [nextExerciseName, setNextExerciseName] = useState('');
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [muted, setMuted] = useState(false);
  // 存储 transition/done 阶段的 timeout id，组件卸载或退出时清理
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggleMuted = () => setMuted((v) => !v);

  const currentExerciseId = pkg.exercises[currentIndex]?.exerciseId;
  const currentExercise = currentExerciseId ? exercises.find((e) => e.id === currentExerciseId) : null;
  const hasGuided = currentExercise ? !!guidedExerciseConfigs[currentExercise.id]?.guidedConfig : false;

  useEffect(() => {
    if (hasGuided) return;
    setCooldownRemaining(20);
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [currentExerciseId]);

  const handleExerciseComplete = () => {
    // Bug N7: phase 守卫，防止快速双击导致重复计数和 timeout 泄漏
    if (phase !== 'exercising') return;
    incrementExercisesCompleted();
    if (currentExercise) incrementCategoryExercise(currentExercise.category);

    if (isLast) {
      setPhase('done');
      incrementPackagesCompleted();
      incrementPackageCompleteCount(pkg.id);
      addExerciseMinutes(pkg.duration);
      pendingTimeoutRef.current = setTimeout(() => {
        pendingTimeoutRef.current = null;
        closeExercisePanel();
      }, 2000);
    } else {
      const nextId = pkg.exercises[currentIndex + 1]?.exerciseId;
      const nextEx = nextId ? exercises.find((e) => e.id === nextId) : null;
      setNextExerciseName(nextEx?.name ?? '');
      setPhase('transition');
      pendingTimeoutRef.current = setTimeout(() => {
        pendingTimeoutRef.current = null;
        advanceExercise();
        setPhase('exercising');
      }, 1500);
    }
  };

  const handleSkipExercise = () => {
    // 跳过的运动不计入分类统计
    if (isLast) {
      closeExercisePanel();
    } else {
      advanceExercise();
    }
  };

  const handleExit = () => {
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
    closeExercisePanel();
  };

  // 组件卸载时清理 pending timeout，避免 advanceExercise 在面板关闭后执行
  useEffect(() => {
    return () => {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!currentExercise) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm animate-[lockFadeIn_0.3s_ease]">
      <div className="text-center w-full max-w-[480px] p-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-white/60 text-sm">{pkg.name} · {currentIndex + 1}/{totalExercises}</span>
          <div className="flex items-center gap-3">
            {hasGuided && (
              <button
                className="text-white/40 hover:text-white"
                onClick={handleToggleMuted}
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            )}
            <button
              className="text-white/40 hover:text-white text-2xl leading-none"
              onClick={handleExit}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-[400px] flex flex-col justify-center">
          {phase === 'transition' && (
            <div className="animate-[lockScaleIn_0.35s_ease]">
              <div className="flex items-center justify-center mb-4">
                <CheckCircle size={48} className="text-success" />
              </div>
              <div className="text-xl font-semibold text-white mb-2">{t('guided.completed')}</div>
              <div className="text-white/50 text-sm mt-8">
                下一个：{nextExerciseName}
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="animate-[lockScaleIn_0.35s_ease]">
              <div className="flex items-center justify-center mb-4">
                <CheckCircle size={48} className="text-success" />
              </div>
              <div className="text-xl font-semibold text-white mb-2">{t('exercise.packageComplete')}</div>
              <div className="text-white/60 text-sm">{t('guided.returning')}</div>
            </div>
          )}

          {phase === 'exercising' && hasGuided && (
            <GuidedExerciseWrapper
              key={currentExercise.id}
              exercise={currentExercise}
              muted={muted}
              onComplete={handleExerciseComplete}
            />
          )}

          {phase === 'exercising' && !hasGuided && (
            <>
              <StaticExerciseContent exercise={currentExercise} />
              <div className="flex justify-center gap-3 mt-6">
                <Button onClick={handleExerciseComplete} disabled={cooldownRemaining > 0}>
                  <CheckCircle size={20} />
                  {isLast ? t('exercise.finishPackage') : t('exercise.complete')}
                  {cooldownRemaining <= 0 && !isLast && <ChevronRight size={16} />}
                </Button>
                <Button variant="secondary" onClick={handleSkipExercise}>
                  <XCircle size={20} />
                  {t('exercise.skip')}
                </Button>
              </div>
              <div className={`mt-3 text-white/50 text-sm ${cooldownRemaining > 0 ? 'visible' : 'invisible'}`}>
                {cooldownRemaining > 0 ? `等待 ${cooldownRemaining}s` : '等待 0s'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ExercisePanel — 入口路由
// ============================================================================

export function ExercisePanel() {
  const exercisePanel = useHealthStore((s) => s.exercisePanel);
  const closeExercisePanel = useHealthStore((s) => s.closeExercisePanel);
  const incrementExercisesCompleted = useHealthStore((s) => s.incrementExercisesCompleted);
  const incrementCategoryExercise = useHealthStore((s) => s.incrementCategoryExercise);
  const addExerciseMinutes = useHealthStore((s) => s.addExerciseMinutes);

  if (!exercisePanel.active) return null;

  if (exercisePanel.singleExerciseId) {
    const exercise = exercises.find((e) => e.id === exercisePanel.singleExerciseId);
    if (!exercise) return null;

    const handleComplete = (ex: Exercise) => {
      incrementExercisesCompleted();
      incrementCategoryExercise(ex.category);
      addExerciseMinutes(1);
      closeExercisePanel();
    };

    return (
      <GuidedSingleExercisePanel
        key={exercise.id}
        exercise={exercise}
        onComplete={handleComplete}
        onExit={closeExercisePanel}
      />
    );
  }

  if (exercisePanel.packageId) {
    return <PackageExerciser packageId={exercisePanel.packageId} />;
  }

  return null;
}
