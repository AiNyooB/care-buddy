import { useMemo } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { PersonStanding, Eye, GlassWater, BicepsFlexed, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { exercises } from '@/data/exercises';
import { GOAL_ROW_CONFIG, type GoalRowConfig } from '@/constants/stats';
import type { ExerciseRecord, GoalKey, DailyGoals } from '@/types';

// 复刻 store 内部 DailyStats 的字段（store 未导出 DailyStats 类型）
interface DayDetailStat {
  date: string;
  sitBreaks: number;
  eyeCare: number;
  waterCups: number;
  exercisesCompleted: number;
  exerciseMinutes: number;
  packagesCompleted: number;
  customBreaks: number;
  workMinutes: number;
}

interface DayDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawDate: string;
  dailyStat: DayDetailStat | null;
  goals: DailyGoals;
  exerciseRecords: ExerciseRecord[];
}

interface DayDetailRowConfig extends GoalRowConfig {
  icon: typeof PersonStanding;
  getValue: (s: DayDetailStat) => number;
}

const ICON_MAP: Record<GoalKey, typeof PersonStanding> = {
  sitBreaks: PersonStanding,
  eyeCare: Eye,
  waterCups: GlassWater,
  exercises: BicepsFlexed,
};

const VALUE_GETTERS: Record<GoalKey, (s: DayDetailStat) => number> = {
  sitBreaks: (s) => s.sitBreaks,
  eyeCare: (s) => s.eyeCare,
  waterCups: (s) => s.waterCups,
  exercises: (s) => s.exercisesCompleted,
};

const DAY_DETAIL_ROWS: DayDetailRowConfig[] = GOAL_ROW_CONFIG.map((row) => ({
  ...row,
  icon: ICON_MAP[row.key],
  getValue: VALUE_GETTERS[row.key],
}));

export function DayDetailDialog({
  open,
  onOpenChange,
  rawDate,
  dailyStat,
  goals,
  exerciseRecords,
}: DayDetailDialogProps) {
  const { t } = useTranslation();

  const dateLabel = useMemo(() => {
    if (!rawDate) return '';
    return format(new Date(rawDate), 'M月d日 EEEE', { locale: zhCN });
  }, [rawDate]);

  // 周目标 / 7 = 日均目标
  const dailyTargets = useMemo(() => {
    return {
      sitBreaks: Math.floor(goals.sitBreaks / 7),
      eyeCare: Math.floor(goals.eyeCare / 7),
      waterCups: Math.floor(goals.waterCups / 7),
      exercises: Math.floor(goals.exercises / 7),
    };
  }, [goals]);

  // 综合达标率 + 达标项数
  const { compositeScore, metCount } = useMemo(() => {
    if (!dailyStat) return { compositeScore: 0, metCount: 0 };
    let met = 0;
    let sum = 0;
    for (const row of DAY_DETAIL_ROWS) {
      const val = row.getValue(dailyStat);
      const target = dailyTargets[row.key];
      const ratio = target > 0 ? Math.min(val / target, 1) : 1;
      sum += ratio;
      if (target === 0 || val >= target) met++;
    }
    return {
      compositeScore: Math.round((sum / DAY_DETAIL_ROWS.length) * 100),
      metCount: met,
    };
  }, [dailyStat, dailyTargets]);

  const exerciseNames = useMemo(() => {
    return exerciseRecords
      .map((r) => exercises.find((e) => e.id === r.exerciseId)?.name)
      .filter((n): n is string => Boolean(n));
  }, [exerciseRecords]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {dateLabel}
            <span className="ml-2 text-type-caption text-muted-foreground">
              {t('stats.dayDetail', { defaultValue: '当天明细' })}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('stats.dayDetail', { defaultValue: '当天明细' })}
          </DialogDescription>
        </DialogHeader>

        {!dailyStat ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {t('stats.noData', { defaultValue: '该天无数据' })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {DAY_DETAIL_ROWS.map(({ key, color, labelKey, labelDefault, icon: Icon, getValue }) => {
              const val = getValue(dailyStat);
              const target = dailyTargets[key];
              const isMet = target === 0 || val >= target;

              return (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className="flex size-6 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: color + '20' }}
                  >
                    <Icon size={12} style={{ color }} />
                  </div>
                  <span className="text-type-caption text-muted-foreground">
                    {t(labelKey, { defaultValue: labelDefault })}
                  </span>
                  <span className="ml-auto text-sm font-semibold tabular-nums">{val}</span>
                  <span
                    className={`flex items-center gap-0.5 text-type-micro ${
                      isMet ? 'text-chart-2' : 'text-destructive'
                    }`}
                  >
                    {isMet ? (
                      <>
                        <Check size={10} />
                        {t('stats.goalMet', { defaultValue: '达标' })}
                      </>
                    ) : (
                      <span>
                        {t('stats.goalNotMet', { defaultValue: '未达标' })} /{target}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}

            {/* 运动子项 chips */}
            {exerciseNames.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {exerciseNames.map((name, idx) => (
                  <span
                    key={`${name}-${idx}`}
                    className="rounded bg-chart-2/20 px-1.5 py-0.5 text-xs text-chart-2"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}

            {/* 综合达标率 */}
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="text-type-caption text-muted-foreground">
                {t('stats.compositeLabel', { defaultValue: '综合达标' })}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">{compositeScore}%</span>
                <span className="text-type-micro text-muted-foreground">
                  {metCount}/4 {t('stats.goalsMet', { defaultValue: '项达标' })}
                </span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
