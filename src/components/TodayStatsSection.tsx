import { useMemo, useState, type ReactNode } from 'react';
import { format, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { MonitorCheck, Activity, PersonStanding, Eye, GlassWater } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import { BarChart, Bar, XAxis, YAxis, ReferenceLine } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import type { ExerciseCategory, PackageType } from '../types';

const CATEGORIES: ExerciseCategory[] = ['spine', 'circulation', 'metabolism', 'vision', 'wrist'];
const PACKAGES: PackageType[] = ['package-quick', 'package-standard', 'package-deep'];

function computeStreak(dailyStats: { date: string; exercisesCompleted: number; sitBreaks: number; waterCups: number; customBreaks: number }[]): number {
  const statsMap = new Map(dailyStats.map((s) => [s.date, s]));
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const dateStr = format(subDays(new Date(), i), 'yyyy-MM-dd');
    const day = statsMap.get(dateStr);
    if (day && (day.sitBreaks > 0 || day.waterCups > 0 || day.exercisesCompleted > 0 || day.customBreaks > 0)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

function formatWorkMinutes(minutes: number): { numerical: ReactNode; unit: string } {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return {
      numerical: (
        <>
          <span>{h}</span>
          <span className="text-type-caption text-muted-foreground">h</span>
          {m > 0 && (
            <>
              <span>{m}</span>
              <span className="text-type-caption text-muted-foreground">m</span>
            </>
          )}
        </>
      ),
      unit: '',
    };
  }
  return {
    numerical: (
      <>
        <span>{minutes}</span>
        <span className="text-type-caption text-muted-foreground">m</span>
      </>
    ),
    unit: '',
  };
}

export function TodayStatsSection() {
  const { t } = useTranslation();
  const todayStats = useHealthStore((s) => s.todayStats);
  const dailyStats = useHealthStore((s) => s.dailyStats);

  const [statPage, setStatPage] = useState(1);
  const chartMode = useHealthStore((s) => s.chartMode);
  const setChartMode = useHealthStore((s) => s.setChartMode);

  const streak = useMemo(() => computeStreak(dailyStats), [dailyStats]);

  const statCards = [
    {
      icon: <MonitorCheck size={20} />,
      label: t('dashboard.workMinutes', { defaultValue: '运行时长' }),
      numerical: formatWorkMinutes(todayStats.workMinutes).numerical,
      unit: '',
    },
    {
      icon: <Activity size={20} />,
      label: t('dashboard.streakDays', { defaultValue: '连续天数' }),
      value: streak,
      unit: t('dashboard.days', { defaultValue: '天' }),
    },
    {
      icon: <PersonStanding size={20} />,
      label: t('statCards.sitReminder', { defaultValue: '久坐提醒' }),
      value: todayStats.sitBreaks,
      unit: t('dashboard.times', { defaultValue: '次' }),
    },
    {
      icon: <Eye size={20} />,
      label: t('statCards.eyeCare', { defaultValue: '护眼提醒' }),
      value: todayStats.eyeCare,
      unit: t('dashboard.times', { defaultValue: '次' }),
    },
    {
      icon: <GlassWater size={20} />,
      label: t('statCards.waterReminder', { defaultValue: '喝水提醒' }),
      value: todayStats.waterCups,
      unit: t('dashboard.times', { defaultValue: '次' }),
    },
  ];

  // TODO: 分页按自定义提醒分组，后续页显示自定义提醒统计
  const totalStatPages = 1;

  const chartData = useMemo(() => {
    if (chartMode === 'exercise') {
      return CATEGORIES.map((cat) => ({
        name: t('categories.' + cat),
        count: todayStats.categoryCounts[cat] ?? 0,
      }));
    }
    return PACKAGES.map((pkg) => ({
      name: t('categories.' + pkg),
      count: todayStats.packageCounts[pkg] ?? 0,
    }));
  }, [chartMode, todayStats, t]);

  const chartConfig = {
    count: {
      label: t('statCards.todayExercise', { defaultValue: '运动次数' }),
      color: 'var(--primary)',
    },
  } satisfies ChartConfig;

  const maxCount = useMemo(() => Math.max(...chartData.map(d => d.count), 4), [chartData]);
  const yTicks = useMemo(() => Array.from({ length: maxCount + 1 }, (_, i) => i), [maxCount]);

  return (
    <div className="relative" style={{ height: '346px' }}>
      {/* ================================================================ */}
      {/* 标题行 — 绝对定位 */}
      {/* ================================================================ */}
      <div
        className="absolute top-0 left-0 flex items-center justify-between"
        style={{ width: 'var(--grid-content)', height: '24px' }}
      >
        <h2 className="text-type-card-title font-semibold text-foreground">
          {t('dashboard.todayStats', { defaultValue: '今日统计' })}
        </h2>
        {totalStatPages > 1 && (
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              {Array.from({ length: totalStatPages }, (_, i) => i + 1).map((page) => (
                <PaginationItem key={page}>
                  <PaginationLink
                    isActive={page === statPage}
                    onClick={() => setStatPage(page)}
                    size="icon-xs"
                    className="rounded-md"
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ))}
            </PaginationContent>
          </Pagination>
        )}
      </div>

      {/* ================================================================ */}
      {/* 5 张统计卡片 — 绝对定位单行排列 */}
      {/* ================================================================ */}
      <div
        className="absolute"
        style={{ top: '36px', left: 0, width: 'var(--grid-content)', height: '122px' }}
      >
        {statCards.map((card, index) => (
          <Card
            key={index}
            className="absolute flex flex-col items-center justify-between gap-0 ring-0 border border-border p-2"
            style={{
              top: 0,
              left: `calc(${index} * (79.2px + var(--grid-gap)))`,
              width: '79.2px',
              height: '122px',
              borderRadius: '10px',
            }}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              {card.icon}
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-baseline gap-0.5">
                <span className="text-type-card-number font-semibold text-foreground tabular-nums">
                  {'numerical' in card ? (card as { numerical: ReactNode }).numerical : card.value}
                </span>
                {card.unit && (
                  <span className="text-type-caption text-muted-foreground">
                    {card.unit}
                  </span>
                )}
              </div>
              <span className="text-type-body text-muted-foreground text-center leading-tight">
                {card.label}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* ================================================================ */}
      {/* 今日锻炼图表卡片 */}
      {/* ================================================================ */}
      <Card
        className="absolute gap-0 ring-0 border border-border p-3"
        style={{
          top: 'calc(36px + 122px + var(--grid-gap))',
          left: 0,
          width: 'var(--grid-content)',
          height: '176px',
          borderRadius: '14px',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {t('statCards.todayExercise', { defaultValue: '运动次数' })}
          </span>
          <div className="ml-auto flex gap-1">
            <Toggle
              size="sm"
              pressed={chartMode === 'exercise'}
              onPressedChange={() => setChartMode('exercise')}
              className="rounded-full px-2.5 text-xs"
            >
              {t('statCards.exercise', { defaultValue: '动作' })}
            </Toggle>
            <Toggle
              size="sm"
              pressed={chartMode === 'package'}
              onPressedChange={() => setChartMode('package')}
              className="rounded-full px-2.5 text-xs"
            >
              {t('statCards.package', { defaultValue: '套餐' })}
            </Toggle>
          </div>
        </div>
        <ChartContainer config={chartConfig} className="!aspect-auto mt-2 w-full [&_*]:outline-none" style={{ height: 'calc(176px - 32px - 8px - 16px)' }}>
          <BarChart data={chartData} margin={{ top: 20, right: 0, left: -12, bottom: -6 }}>
            {yTicks.filter(t => t >= 0).map(tick => (
              <ReferenceLine key={tick} y={tick} stroke="var(--border)" strokeDasharray="3 3" />
            ))}
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, maxCount]} ticks={yTicks} width={28} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} barSize={18} label={{ position: 'top', fontSize: 11, fontWeight: 600, fill: 'var(--foreground)' }} />
          </BarChart>
        </ChartContainer>
      </Card>
    </div>
  );
}