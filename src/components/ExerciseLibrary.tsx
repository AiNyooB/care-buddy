import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { exercises, exercisePackages, categoryNames, priorityLabels } from '../data/exercises';
import { guidedExerciseConfigs } from '../data/guided-configs';
import type { Exercise, ExerciseCategory } from '../types';
import { Play, Clock, Target, CheckCircle, ChevronRight, Dumbbell, Headphones } from './Icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { primeSpeech } from '../services/voice';

const CATEGORIES: ExerciseCategory[] = ['spine', 'circulation', 'metabolism', 'vision', 'wrist'];

interface ExerciseDetailModalProps {
  exercise: Exercise;
  onClose: () => void;
  onComplete: (exercise: Exercise) => void;
}

function ExerciseDetailModal({ exercise, onClose, onComplete }: ExerciseDetailModalProps) {
  const { t } = useTranslation();
  const priority = priorityLabels[exercise.priority];
  const [completed, setCompleted] = useState(false);
  const openSingleExercisePanel = useHealthStore((s) => s.openSingleExercisePanel);

  const hasGuided = !!guidedExerciseConfigs[exercise.id]?.guidedConfig;

  const handleComplete = () => {
    setCompleted(true);
    onComplete(exercise);
    setTimeout(() => onClose(), 1500);
  };

  const handleGuidedMode = async () => {
    onClose();
    await primeSpeech();
    openSingleExercisePanel(exercise.id);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold text-white" style={{ backgroundColor: priority.color }}>
              {priority.label}
            </span>
            <DialogTitle>{exercise.name}</DialogTitle>
          </div>
        </DialogHeader>

        <DialogDescription className="text-sm text-foreground">
          {exercise.description}
        </DialogDescription>

        <div className="flex gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><Target size={14} />{exercise.targetArea}</span>
          <span className="flex items-center gap-1.5"><Clock size={14} />{exercise.duration}</span>
        </div>

        <div className="space-y-3">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('exercise.whyImportant')}</h4>
            <p className="text-sm leading-relaxed text-foreground">{exercise.whyImportant}</p>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('exercise.instructions')}</h4>
            <p className="text-sm leading-relaxed text-foreground">{exercise.instructions}</p>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('exercise.evidenceSource')}</h4>
            <p className="text-xs italic text-muted-foreground">{exercise.evidenceSource}</p>
          </div>

            {exercise.repetitions && (
              <div className="flex gap-3 rounded-lg bg-muted p-3 text-sm font-medium text-foreground">
                <span>{t('exercise.repetitions')}: {exercise.repetitions}{t('time.count')}</span>
                {exercise.holdTime && <span>{t('exercise.holdTime')}: {exercise.holdTime}{t('time.sec')}</span>}
                {exercise.sets && <span>{t('exercise.sets')}: {exercise.sets}{t('time.group')}</span>}
              </div>
            )}
        </div>

        <DialogFooter>
          <div className="flex w-full gap-2">
            <Button
              className="flex-1"
              onClick={handleComplete}
              disabled={completed}
              variant={completed ? 'default' : 'default'}
            >
              {completed ? (
                <><CheckCircle size={18} /> {t('exercise.completed')}</>
              ) : (
                <><Play size={18} /> {t('exercise.markComplete')}</>
              )}
            </Button>
            {hasGuided && !completed && (
              <Button variant="secondary" className="flex-1" onClick={handleGuidedMode}>
                <Headphones size={18} /> {t('exercise.guidedMode')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExerciseCard({ exercise, onClick }: { exercise: Exercise; onClick: () => void }) {
  return (
    <Card
      className="border border-border ring-0 p-4 w-full cursor-pointer hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring-focus active:bg-muted/70"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      role="button"
      tabIndex={0}
    >
      <CardContent className="flex items-center gap-3 p-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Play size={16} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h4 className="text-sm font-medium leading-snug text-foreground truncate">{exercise.name}</h4>
          <p className="truncate text-xs text-muted-foreground">{exercise.description}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Clock size={12} />
          {exercise.duration}
        </span>
        <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function PackageCard({ pkg, onStart }: { pkg: typeof exercisePackages[0]; onStart: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="border border-border ring-0 p-3 h-[140px]">
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
              <Dumbbell size={16} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">{pkg.name}</h4>
              <span className="text-[0.6875rem] text-primary">{pkg.duration}{t('time.minutes')} · {pkg.exercises.length}{t('exercise.repetitions')}</span>
            </div>
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{pkg.description}</p>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock size={12} /> {pkg.recommendedFrequency}
          </span>
          <Button variant="default" className="h-8 rounded-full" onClick={onStart}>
            <Play size={14} />
            {t('exercise.startPackage')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExerciseLibrary() {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory>('spine');
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  const incrementExercisesCompleted = useHealthStore((s) => s.incrementExercisesCompleted);
  const incrementCategoryExercise = useHealthStore((s) => s.incrementCategoryExercise);
  const openExercisePanel = useHealthStore((s) => s.openExercisePanel);

  const filteredExercises = useMemo(
    () => exercises.filter((e) => e.category === selectedCategory).slice(0, 8),
    [selectedCategory]
  );

  const handleExerciseComplete = (exercise: Exercise) => {
    incrementExercisesCompleted();
    incrementCategoryExercise(exercise.category);
  };

  const categoryTabLabels: Record<ExerciseCategory, string> = categoryNames;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 运动套餐区域 - 2列网格 */}
      <div className="grid grid-cols-2 gap-3">
        {exercisePackages.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} onStart={() => openExercisePanel(pkg.id)} />
        ))}
      </div>

      {/* 分类标签 */}
      <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as ExerciseCategory)} className="mb-2">
        <TabsList variant="line" className="gap-4">
          {CATEGORIES.map((cat) => (
            <TabsTrigger key={cat} value={cat} className="border-0">
              {categoryTabLabels[cat]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* 运动列表 - 单列 */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {filteredExercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            onClick={() => setSelectedExercise(exercise)}
          />
        ))}
      </div>

      {selectedExercise && (
        <ExerciseDetailModal
          exercise={selectedExercise}
          onClose={() => setSelectedExercise(null)}
          onComplete={handleExerciseComplete}
        />
      )}
    </div>
  );
}
