import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { useHealthStore } from '../store';
import { BicepsFlexed, Timer, Activity, PersonStanding, Eye, GlassWater, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { computeStreak } from '@/utils/time';

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export function StatsDashboard() {
  const { t } = useTranslation();
  const dailyStats = useHealthStore((s) => s.dailyStats);

  const streak = useMemo(() => computeStreak(dailyStats), [dailyStats]);

  const weekData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayData = dailyStats.find((s) => s.date === dateStr);
      days.push({
        date: DAY_LABELS[d.getDay()],
        sitBreaks: dayData?.sitBreaks || 0,
        eyeCare: dayData?.eyeCare || 0,
        waterCups: dayData?.waterCups || 0,
        exercises: dayData?.exercisesCompleted || 0,
        exerciseMinutes: dayData?.exerciseMinutes || 0,
        customBreaks: dayData?.customBreaks || 0,
      });
    }
    return days;
  }, [dailyStats]);

  const weekTotals = useMemo(() => {
    return weekData.reduce(
      (acc, d) => ({
        exercises: acc.exercises + d.exercises,
        exerciseMinutes: acc.exerciseMinutes + d.exerciseMinutes,
        sitBreaks: acc.sitBreaks + d.sitBreaks,
        eyeCare: acc.eyeCare + d.eyeCare,
        waterCups: acc.waterCups + d.waterCups,
        customBreaks: acc.customBreaks + d.customBreaks,
      }),
      { exercises: 0, exerciseMinutes: 0, sitBreaks: 0, eyeCare: 0, waterCups: 0, customBreaks: 0 }
    );
  }, [weekData]);

  const biweeklyData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayData = dailyStats.find((s) => s.date === dateStr);
      days.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        minutes: dayData?.exerciseMinutes || 0,
      });
    }
    return days;
  }, [dailyStats]);

  const avgExerciseMinutes = useMemo(() => {
    const total = biweeklyData.reduce((sum, d) => sum + d.minutes, 0);
    return biweeklyData.length > 0 ? Math.round(total / biweeklyData.length) : 0;
  }, [biweeklyData]);

  const weeklyChartConfig = {
    sitBreaks: {
      label: t('statCards.sitReminder', { defaultValue: '久坐提醒' }),
      color: 'var(--chart-1)',
    },
    eyeCare: {
      label: t('statCards.eyeCare', { defaultValue: '护眼提醒' }),
      color: 'var(--chart-3)',
    },
    waterCups: {
      label: t('statCards.waterReminder', { defaultValue: '喝水提醒' }),
      color: 'var(--chart-4)',
    },
  } satisfies ChartConfig;

  const exerciseChartConfig = {
    minutes: {
      label: t('stats.exerciseMinutes', { defaultValue: '运动时长(分钟)' }),
      color: 'var(--chart-2)',
    },
  } satisfies ChartConfig;

  return (
    <div className="flex w-full flex-col gap-2">
      {/* 健康概览卡片 */}
      <Card size="sm" className="border border-border ring-0">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{t('stats.overview', { defaultValue: '健康概览' })}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-stretch gap-2">
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg bg-muted/50 py-1.5">
              <div className="flex items-center gap-1 text-orange-500">
                <Activity size={20} />
                <span className="text-xl font-bold">{streak}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">{t('dashboard.streakDays', { defaultValue: '连续天数' })}</span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg bg-muted/50 py-1.5">
              <div className="flex items-center gap-1 text-primary">
                <BicepsFlexed size={16} />
                <span className="text-xl font-bold">{weekTotals.exercises}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">{t('stats.thisWeekExercises', { defaultValue: '本周运动(次)' })}</span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg bg-muted/50 py-1.5">
              <div className="flex items-center gap-1 text-chart-2">
                <Timer size={16} />
                <span className="text-xl font-bold">{weekTotals.exerciseMinutes}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">{t('stats.thisWeekMinutes', { defaultValue: '本周时长(分)' })}</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <div className="flex flex-col items-center rounded-md bg-muted/30 py-1">
              <div className="flex items-center gap-0.5">
                <PersonStanding size={20} className="text-chart-1" />
                <span className="text-sm font-semibold tabular-nums">{weekTotals.sitBreaks}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{t('statCards.sitReminder', { defaultValue: '久坐提醒' })}</span>
            </div>
            <div className="flex flex-col items-center rounded-md bg-muted/30 py-1">
              <div className="flex items-center gap-0.5">
                <Eye size={20} className="text-chart-3" />
                <span className="text-sm font-semibold tabular-nums">{weekTotals.eyeCare}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{t('statCards.eyeCare', { defaultValue: '护眼提醒' })}</span>
            </div>
            <div className="flex flex-col items-center rounded-md bg-muted/30 py-1">
              <div className="flex items-center gap-0.5">
                <GlassWater size={20} className="text-chart-4" />
                <span className="text-sm font-semibold tabular-nums">{weekTotals.waterCups}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{t('statCards.waterReminder', { defaultValue: '喝水提醒' })}</span>
            </div>
            <div className="flex flex-col items-center rounded-md bg-muted/30 py-1">
              <div className="flex items-center gap-0.5">
                <Plus size={20} className="text-muted-foreground" />
                <span className="text-sm font-semibold tabular-nums">{weekTotals.customBreaks}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{t('stats.customBreaks', { defaultValue: '主动' })}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 本周健康习惯卡片 */}
      <Card size="sm" className="border border-border ring-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            {t('stats.weeklyHabits', { defaultValue: '本周健康习惯' })}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          <ChartContainer config={weeklyChartConfig} className="!aspect-auto w-full" style={{ height: '175px' }}>
            <BarChart data={weekData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="sitBreaks" fill="var(--color-sitBreaks)" radius={[3, 3, 0, 0]} barSize={10} />
              <Bar dataKey="eyeCare" fill="var(--color-eyeCare)" radius={[3, 3, 0, 0]} barSize={10} />
              <Bar dataKey="waterCups" fill="var(--color-waterCups)" radius={[3, 3, 0, 0]} barSize={10} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* 运动趋势卡片 */}
      <Card size="sm" className="border border-border ring-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <BicepsFlexed size={14} />
            {t('stats.exerciseTrend', { defaultValue: '运动趋势' })}
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">
              {t('stats.avgMinutes', { defaultValue: '日均' })} {avgExerciseMinutes}{t('dashboard.minutes', { defaultValue: '分钟' })}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {biweeklyData.every(d => d.minutes === 0) ? (
            <div className="flex h-[135px] flex-col items-center justify-center gap-1 text-center text-muted-foreground">
              <Activity size={24} className="opacity-40" />
              <span className="text-xs">{t('stats.noExerciseData', { defaultValue: '暂无运动数据，开始运动吧' })}</span>
            </div>
          ) : (
            <ChartContainer config={exerciseChartConfig} className="!aspect-auto w-full" style={{ height: '135px' }}>
              <BarChart data={biweeklyData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ReferenceLine y={avgExerciseMinutes} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeWidth={1} />
                <Bar dataKey="minutes" fill="var(--color-minutes)" radius={[3, 3, 0, 0]} barSize={14} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
