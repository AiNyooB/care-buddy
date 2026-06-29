import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { exercises, categoryNames, priorityLabels } from '../data/exercises';
import { guidedExerciseConfigs } from '../data/guided-configs';
import type { Exercise, ExerciseCategory } from '../types';
import { Play, Target, CheckCircle, Headphones, DiamondPercent, Diamond, CircleDot, Plus, Clock } from './Icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { primeSpeech } from '../services/voice';
import { PackageHero } from './PackageHero';

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
            <span className="rounded-full px-2 py-[1px] text-type-badge font-medium text-white" style={{ backgroundColor: priority.color }}>
              {priority.label}
            </span>
            <DialogTitle className="truncate">{exercise.name}</DialogTitle>
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
  const priority = priorityLabels[exercise.priority];
  return (
    <Card
      className="h-[60px] cursor-pointer border border-border p-2 gap-0 ring-0 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/50"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      role="button"
      tabIndex={0}
    >
      <CardContent className="flex flex-col gap-1 p-0">
        {/* 顶行：标题 + 优先级标签 */}
        <div className="flex items-start justify-between">
          <h4 className="min-w-0 flex-1 truncate text-type-card-title font-semibold text-foreground">
            {exercise.name}
          </h4>
          <span className="ml-2 shrink-0 flex items-center" style={{ color: priority.color }}>
            {exercise.priority === 'core' && <DiamondPercent size={14} aria-label="必做" />}
            {exercise.priority === 'strong' && <Diamond size={14} aria-label="推荐" />}
            {exercise.priority === 'recommend' && <CircleDot size={14} aria-label="可选" />}
            {exercise.priority === 'supplement' && <Plus size={14} aria-label="补充" />}
          </span>
        </div>
        {/* 描述 — 单行，距标题4px */}
        <p className="line-clamp-1 text-type-caption text-muted-foreground">
          {exercise.description}
        </p>
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
    <div className="flex h-full flex-col">
      {/* 套餐 Hero — 替换旧的 PackageCard 网格 */}
      <PackageHero />

      <Separator className="my-3" style={{ width: 'var(--grid-content)' }} />

      <div className="flex min-h-[314px] flex-1 flex-col gap-2">
        {/* 分类标签 */}
        <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as ExerciseCategory)}>
          <TabsList variant="line" className="gap-4">
            {CATEGORIES.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="border-0">
                {categoryTabLabels[cat]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* 运动卡片 — 2 列网格 */}
        <div className="grid grid-cols-2 gap-3 content-start flex-1">
          {filteredExercises.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              onClick={() => setSelectedExercise(exercise)}
            />
          ))}
        </div>
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
