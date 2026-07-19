import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getStorage, STORAGE_KEYS } from '@/utils/storage';
import type { ExerciseRecord, StatsRange } from '@/types';

import { StatsOverview } from './stats/StatsOverview';
import { StatsCalendarHeatmap } from './stats/CalendarHeatmap';
import { DayDetailDialog } from './stats/DayDetailDialog';
import { GoalEditDialog } from './stats/GoalEditDialog';

export function StatsDashboard() {
  const { t } = useTranslation();
  const dailyStats = useHealthStore((s) => s.dailyStats);
  const dailyGoals = useHealthStore((s) => s.dailyGoals);
  const statsRange = useHealthStore((s) => s.statsRange);
  const setStatsRange = useHealthStore((s) => s.setStatsRange);
  const setDailyGoals = useHealthStore((s) => s.setDailyGoals);
  const resetDailyGoals = useHealthStore((s) => s.resetDailyGoals);

  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const [dayDetailOpen, setDayDetailOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // selectedDateStats
  const selectedDateStats = useMemo(() => {
    if (!selectedDate) return null;
    return dailyStats.find((s) => s.date === selectedDate) ?? null;
  }, [dailyStats, selectedDate]);

  // selectedDateExercises
  const selectedDateExercises = useMemo<ExerciseRecord[]>(() => {
    if (!selectedDate) return [];
    const history = getStorage<ExerciseRecord[]>(STORAGE_KEYS.EXERCISE_HISTORY, []);
    return history.filter((r) => r.completedAt.startsWith(selectedDate));
  }, [selectedDate]);

  return (
    <div className="flex w-full flex-col gap-3 h-full overflow-hidden">
      {/* 顶部条 */}
      <div className="flex items-center justify-between">
        <h2 className="text-type-page-title">{t('tabs.stats', { defaultValue: '统计' })}</h2>
        <div className="flex items-center gap-2">
          <ToggleGroup
            value={[statsRange]}
            onValueChange={(v) => {
              const val = v[0] as StatsRange | undefined;
              if (val) setStatsRange(val);
            }}
            size="sm"
          >
            <ToggleGroupItem value="week">
              {t('stats.week', { defaultValue: '周' })}
            </ToggleGroupItem>
            <ToggleGroupItem value="month">
              {t('stats.month', { defaultValue: '月' })}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Section 1: 累计 + 运动分类 */}
      <StatsOverview />

      {/* 分隔线 */}
      <div className="h-px bg-border" />

      {/* Section 2: 日历热力图 */}
      <StatsCalendarHeatmap />

      {/* Dialogs */}
      <DayDetailDialog
        open={dayDetailOpen}
        onOpenChange={setDayDetailOpen}
        rawDate={selectedDate ?? ''}
        dailyStat={selectedDateStats}
        goals={dailyGoals}
        exerciseRecords={selectedDateExercises}
      />
      <GoalEditDialog
        open={goalEditOpen}
        onOpenChange={setGoalEditOpen}
        goals={dailyGoals}
        onSave={(g) => {
          setDailyGoals(g);
          setGoalEditOpen(false);
        }}
        onReset={() => {
          resetDailyGoals();
          setGoalEditOpen(false);
        }}
      />
    </div>
  );
}
