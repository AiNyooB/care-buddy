import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { exercises, categoryNames, priorityLabels } from '../data/exercises';
import { guidedExerciseConfigs } from '../data/guided-configs';
import type { Exercise, ExerciseCategory } from '../types';
import { Play, Target, CheckCircle, AudioWaveform, Clock } from './Icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from '@/components/ui/item';
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
            <span className="rounded-full px-2 py-[1px] text-type-badge text-white" style={{ backgroundColor: priority.color }}>
              {t('exercise.priority' + exercise.priority.charAt(0).toUpperCase() + exercise.priority.slice(1))}
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
                <AudioWaveform size={18} /> {t('exercise.guidedMode')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExerciseRow({
  exercise,
  onOpen,
  onQuickStart,
}: {
  exercise: Exercise;
  onOpen: () => void;
  onQuickStart: () => void;
}) {
  const { t } = useTranslation();
  const priority = priorityLabels[exercise.priority];
  const hasGuided = !!guidedExerciseConfigs[exercise.id]?.guidedConfig;

  return (
    <Item
      variant="outline"
      size="sm"
      role="button"
      tabIndex={0}
      className="cursor-pointer select-none hover:bg-muted/40 active:bg-muted/60"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <ItemContent>
        <ItemTitle className="items-center gap-1.5 text-foreground">
          {exercise.name}
          <Badge
            variant="outline"
            style={{ color: priority.color, borderColor: priority.color }}
          >
            {t('exercise.priority' + exercise.priority.charAt(0).toUpperCase() + exercise.priority.slice(1))}
          </Badge>
        </ItemTitle>
        <ItemDescription className="line-clamp-1">{exercise.description}</ItemDescription>
      </ItemContent>
      {hasGuided && (
        <ItemActions>
          <Button
            size="icon-sm"
            variant="outline"
            className="shrink-0"
            title={t('exercise.quickStart')}
            aria-label={t('exercise.quickStart')}
            onClick={(e) => {
              e.stopPropagation();
              onQuickStart();
            }}
          >
            <AudioWaveform size={14} />
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}

export function ExerciseLibrary() {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory>('spine');
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  const incrementExercisesCompleted = useHealthStore((s) => s.incrementExercisesCompleted);
  const incrementCategoryExercise = useHealthStore((s) => s.incrementCategoryExercise);
  const openSingleExercisePanel = useHealthStore((s) => s.openSingleExercisePanel);

  const filteredExercises = useMemo(
    () => exercises.filter((e) => e.category === selectedCategory),
    [selectedCategory]
  );

  const handleQuickStart = async (exercise: Exercise) => {
    await primeSpeech();
    openSingleExercisePanel(exercise.id);
  };

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

        {/* 运动列表 — 单列 ItemGroup */}
        <ScrollArea className="min-h-0 flex-1">
          <ItemGroup className="pr-3">
            {filteredExercises.map((exercise) => (
              <ExerciseRow
                key={exercise.id}
                exercise={exercise}
                onOpen={() => setSelectedExercise(exercise)}
                onQuickStart={() => handleQuickStart(exercise)}
              />
            ))}
          </ItemGroup>
        </ScrollArea>
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
