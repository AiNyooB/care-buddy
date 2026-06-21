import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { PersonStanding, GlassWater, Eye, MonitorCheck, Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { CATEGORY_CONFIG } from '../constants';
import type { ExerciseCategory, PackageType } from '../types';

const CATEGORIES: ExerciseCategory[] = ['spine', 'circulation', 'metabolism', 'vision', 'wrist'];
const PACKAGES: PackageType[] = ['package-quick', 'package-standard', 'package-deep'];

function computeStreak(dailyStats: { date: string; exercisesCompleted: number; sitBreaks: number; waterCups: number; customBreaks: number }[]): number {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const dateStr = format(subDays(new Date(), i), 'yyyy-MM-dd');
    const day = dailyStats.find((s) => s.date === dateStr);
    if (day && (day.sitBreaks > 0 || day.waterCups > 0 || day.exercisesCompleted > 0 || day.customBreaks > 0)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

export function TodayStats() {
  const { t } = useTranslation();
  const todayStats = useHealthStore((s) => s.todayStats);
  const dailyStats = useHealthStore((s) => s.dailyStats);

  const [chartMode, setChartMode] = useState<'exercise' | 'package'>('exercise');

  const streak = useMemo(() => computeStreak(dailyStats), [dailyStats]);

  const chartData = useMemo(() => {
    if (chartMode === 'exercise') {
      return CATEGORIES.map((cat) => ({
        name: t('categories.' + cat),
        count: todayStats.categoryCounts[cat] ?? 0,
      }));
    }
    return PACKAGES.map((pkg) => ({
      name: pkg === 'package-quick' ? t('categories.wrist') : pkg === 'package-standard' ? t('categories.circulation') : t('categories.metabolism'),
      count: todayStats.packageCounts[pkg] ?? 0,
    }));
  }, [chartMode, todayStats, t]);

  const statCards = [
    { icon: <MonitorCheck size={24} />, label: t('statCards.workMinutes'), value: `${todayStats.workMinutes}${t('time.minutes')}` },
    { icon: <Eye size={24} />, label: t('statCards.eyeCare'), value: `${todayStats.eyeCare}${t('statCards.exercise')}` },
    { icon: <PersonStanding size={24} />, label: t('statCards.sitReminder'), value: `${todayStats.sitBreaks}${t('statCards.exercise')}` },
    { icon: <GlassWater size={24} />, label: t('statCards.waterReminder'), value: `${todayStats.waterCups}${t('statCards.exercise')}` },
  ];

  const chartConfig = {
    count: {
      label: t('statCards.todayExercise'),
      color: 'var(--primary)',
    },
  } satisfies ChartConfig;

  return (
    <div className="flex flex-col pt-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex flex-col gap-0">
          <h2 className="text-type-page-title font-bold text-foreground">{t('statCards.todayStats')}</h2>
          <span className="text-type-caption text-muted-foreground">{t('statCards.todaySubtitle')}</span>
        </div>
        {streak > 0 && (
          <Tooltip>
            <TooltipTrigger className="mt-2 flex h-6 cursor-pointer items-center rounded-full bg-primary/10 px-3 text-sm font-semibold text-primary">
              {streak}
            </TooltipTrigger>
            <TooltipContent side="left">
              {t('statCards.streakTooltip', { days: streak })}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {statCards.map((card, i) => (
          <Card key={i} className="flex flex-row h-[70px] w-[208px] items-center justify-between rounded-[14px] border border-border p-3 ring-0">
            <div className="flex size-8 items-center justify-center rounded-[8px] text-primary" style={{ backgroundColor: '#DBEAFE' }}>
              {card.icon}
            </div>
            <div className="text-right">
              <div className="text-type-card-title font-semibold text-foreground">{card.value}</div>
              <div className="text-type-body text-muted-foreground">
                {card.label}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="!gap-0 rounded-[14px] border border-border p-3 ring-0">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Activity size={14} />
          </div>
          <span className="text-sm font-semibold text-foreground">{t('statCards.todayExercise')}</span>
          <div className="ml-auto flex gap-1">
            <Toggle
              size="sm"
              pressed={chartMode === 'exercise'}
              onPressedChange={() => setChartMode('exercise')}
              className="rounded-full px-3"
            >
              {t('statCards.exercise')}
            </Toggle>
            <Toggle
              size="sm"
              pressed={chartMode === 'package'}
              onPressedChange={() => setChartMode('package')}
              className="rounded-full px-3"
            >
              {t('statCards.package')}
            </Toggle>
          </div>
        </div>
        <ChartContainer config={chartConfig} className="!aspect-auto h-[128px] w-full">
          <BarChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: -6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis width={20} tick={{ fontSize: 11, fill: 'var(--muted-foreground)', textAnchor: 'middle' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} barSize={24} />
          </BarChart>
        </ChartContainer>
      </Card>
    </div>
  );
}
