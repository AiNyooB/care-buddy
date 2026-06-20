import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { PersonStanding, GlassWater, Eye, Clock, Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { CATEGORY_CONFIG } from '../constants';
import type { ExerciseCategory, PackageType } from '../types';

const CATEGORIES: ExerciseCategory[] = ['spine', 'circulation', 'metabolism', 'vision', 'wrist'];
const PACKAGES: PackageType[] = ['package-quick', 'package-standard', 'package-deep'];

function computeStreak(dailyStats: { date: string; exercisesCompleted: number; sitBreaks: number; waterCups: number; customBreaks: number }[]): number {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
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
    { icon: <Clock size={16} />, label: t('statCards.workMinutes'), value: `${todayStats.workMinutes}${t('time.minutes')}` },
    { icon: <Eye size={16} />, label: t('statCards.eyeCare'), value: `${todayStats.eyeCare}${t('statCards.exercise')}` },
    { icon: <PersonStanding size={16} />, label: t('statCards.sitReminder'), value: `${todayStats.sitBreaks}${t('statCards.exercise')}` },
    { icon: <GlassWater size={16} />, label: t('statCards.waterReminder'), value: `${todayStats.waterCups}${t('statCards.exercise')}` },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0">
          <h2 className="text-lg font-bold leading-8 text-foreground">{t('statCards.todayStats')}</h2>
          <span className="text-xs leading-[18px] text-muted-foreground">{t('statCards.todaySubtitle')}</span>
        </div>
        {streak > 0 && (
          <Tooltip>
            <TooltipTrigger className="mt-1 flex h-6 cursor-pointer items-center rounded-full bg-muted px-3 text-sm font-semibold text-foreground">
              {streak}
            </TooltipTrigger>
            <TooltipContent side="left">
              {t('statCards.streakTooltip', { days: streak })}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {statCards.map((card, i) => (
          <Card key={i} className="flex items-center justify-between p-4 shadow-sm">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
              {card.icon}
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-foreground">{card.value}</div>
              <div className="text-xs text-muted-foreground">
                {card.label}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="flex flex-col p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
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
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <RechartsTooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
