/**
 * GuidedExerciseContent — 共享引导锻炼内容组件
 * 从 ExercisePanel.tsx 抽出，供 LockScreenSlave 复用
 *
 * 结构：Header(固定) → ProgressBar(固定) → CenterContent(动态,固定最小高度) → Footer(固定)
 */

import { useTranslation } from 'react-i18next';
import { BicepsFlexed } from 'lucide-react';
import { CheckCircle } from '../Icons';
import { Button } from '@/components/ui/button';
import type { Exercise, GuidedConfig } from '../../types';
import type { GuidedExerciseState } from '../../hooks/useGuidedExercise';

export interface GuidedExerciseContentProps {
  exercise: Exercise;
  guidedState: GuidedExerciseState;
  guidedConfig: GuidedConfig;
  showProgress?: boolean;
  currentIndex?: number;
  totalExercises?: number;
  onExit?: () => void;
  showExitButton?: boolean;
}

export function GuidedExerciseContent({
  exercise,
  guidedState,
  guidedConfig,
  showProgress,
  currentIndex,
  totalExercises,
  onExit,
  showExitButton = true,
}: GuidedExerciseContentProps) {
  const { t } = useTranslation();

  const totalSteps = guidedConfig.cycle.length * guidedConfig.repetitions;
  const currentStepGlobal = (guidedState.currentRepetition - 1) * guidedConfig.cycle.length + guidedState.currentCycleStep;
  const progress = Math.min(100, (currentStepGlobal / totalSteps) * 100);

  const isPrep = guidedState.status === 'prep';
  const isDone = guidedState.status === 'done';
  const isExercise = guidedState.status === 'active' || guidedState.status === 'transition' || guidedState.status === 'roundComplete';
  const showExit = isExercise && showExitButton;
  const showHeader = isExercise;
  const showProgressBar = isExercise;

  if (isPrep) {
    return (
      <div className="text-center animate-[lockScaleIn_0.35s_ease]">
        <div className="truncate text-2xl font-semibold text-white mb-2">{exercise.name}</div>
        <div className="text-white/60 text-sm mb-8">{t('guided.prep')}</div>
        <div className="flex items-center justify-center">
          <span className="text-[5rem] font-bold text-white leading-none">{guidedState.prepRemaining}</span>
        </div>
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="text-center animate-[lockScaleIn_0.35s_ease]">
        <div className="flex items-center justify-center mb-6">
          <CheckCircle size={64} className="text-success" />
        </div>
        <div className="text-2xl font-semibold text-white mb-2">{t('guided.completed')}</div>
        <div className="text-white/60 text-sm">{t('guided.returning')}</div>
      </div>
    );
  }

  const step = guidedState.currentStep;
  const isActive = guidedState.status === 'active';
  const isTransition = guidedState.status === 'transition';
  const isRoundComplete = guidedState.status === 'roundComplete';

  const stepProgress = step && isActive ? 1 - (guidedState.stepRemaining / step.duration) : 0;
  const displayNumber = isActive ? guidedState.stepRemaining : 0;

  return (
    <div className="w-full">
      {showHeader && (
        <div className="flex items-center gap-3 mb-3 text-white flex-shrink-0">
          <BicepsFlexed size={20} />
          <span className="text-xl font-semibold flex-1 min-w-0 truncate">{exercise.name}</span>
          {guidedConfig.repetitions > 1 && (
            <span className="text-white/60 text-sm tabular-nums">
              {t('guided.remainingCycles', { count: Math.max(0, guidedConfig.repetitions - guidedState.currentRepetition) })}
            </span>
          )}
          {showProgress && (
            <span className="text-base font-semibold text-white/80">
              {(currentIndex ?? 0) + 1} / {totalExercises}
            </span>
          )}
        </div>
      )}

      {showProgressBar && (
        <div className="h-1 bg-white/20 rounded-sm mb-4 overflow-hidden flex-shrink-0">
          <div
            className="h-full rounded-sm transition-all duration-300 bg-gradient-to-r from-success to-success/80"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="h-[260px] flex flex-col items-center justify-center text-center py-4 overflow-y-auto">
        {isRoundComplete ? (
          <div className="transition-opacity duration-200">
            <div className="text-3xl font-bold text-success mb-2">
              第 {guidedState.currentRepetition} 组
            </div>
            <div className="text-white/60 text-base">{t('guided.prep')}</div>
          </div>
        ) : isTransition ? null : isActive ? (
          <div className="transition-opacity duration-200">
            <div className="text-white/80 text-lg mb-2">{step?.text ?? ''}</div>
            <div className="text-white/50 text-sm mb-5 max-w-[360px] mx-auto">{step?.instruction ?? ''}</div>
            <div className="mx-auto mb-2">
              <span className="text-[4rem] font-bold text-white leading-none tabular-nums inline-block">{displayNumber}</span>
              <div className="text-white/40 text-sm mt-1">{t('guided.secondsRemaining')}</div>
            </div>
          </div>
        ) : (
          <div className="opacity-0" />
        )}
      </div>

      {showExit && onExit && (
        <div className="flex justify-center mt-10 flex-shrink-0">
          <Button variant="ghost" className="text-white/60" onClick={onExit}>
            {t('guided.exit')}
          </Button>
        </div>
      )}
    </div>
  );
}
