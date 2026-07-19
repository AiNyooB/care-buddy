import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { useHealthStore } from '@/store';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { StatsRange, GoalKey } from '@/types';

interface CompletionTrendProps {
  range: StatsRange;
}

type DailyStatsField = 'sitBreaks' | 'eyeCare' | 'waterCups' | 'exercisesCompleted';

const GOAL_FIELDS: { key: GoalKey; field: DailyStatsField }[] = [
  { key: 'sitBreaks', field: 'sitBreaks' },
  { key: 'eyeCare', field: 'eyeCare' },
  { key: 'waterCups', field: 'waterCups' },
  { key: 'exercises', field: 'exercisesCompleted' },
];

export function CompletionTrend({ range }: CompletionTrendProps) {
  const { t } = useTranslation();
  const dailyStats = useHealthStore((s) => s.dailyStats);
  const dailyGoals = useHealthStore((s) => s.dailyGoals);

  const chartConfig = {
    completion: {
      label: t('stats.completionRate', { defaultValue: '完成率' }),
      color: 'var(--chart-2)',
    },
  } satisfies ChartConfig;

  const { chartData, avgRate } = useMemo(() => {
    const days = range === 'week' ? 7 : 30;

    const data = Array.from({ length: days }, (_, i) => {
      const d = subDays(new Date(), days - 1 - i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayData = dailyStats.find((s) => s.date === dateStr);

      let met = 0;
      if (dayData) {
        for (const { key, field } of GOAL_FIELDS) {
          const goal = dailyGoals[key];
          const val = dayData[field];
          if (goal > 0 && val >= goal) {
            met++;
          }
        }
      }

      const rate = Math.round((met / GOAL_FIELDS.length) * 100);

      return {
        date: range === 'week'
          ? format(d, 'E')
          : `${d.getMonth() + 1}/${d.getDate()}`,
        completion: rate,
      };
    });

    const total = data.reduce((sum, d) => sum + d.completion, 0);
    const avg = data.length > 0 ? Math.round(total / data.length) : 0;

    return { chartData: data, avgRate: avg };
  }, [dailyStats, dailyGoals, range]);

  const isAllZero = chartData.every((d) => d.completion === 0);

  return (
    <div className="flex flex-col" style={{ height: '150px' }}>
      <span className="text-type-caption text-muted-foreground mb-1">
        {t('stats.trendLabel', { defaultValue: '趋势' })}
      </span>

      {isAllZero ? (
        <div className="flex-1 flex items-center justify-center text-type-micro text-muted-foreground">
          {t('stats.noData', { defaultValue: '暂无数据' })}
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="!aspect-auto w-full flex-1" style={{ minHeight: 0 }}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              interval={range === 'week' ? 0 : 6}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={28}
              tickFormatter={(v) => `${v}%`}
            />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
            <ReferenceLine
              y={avgRate}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `${t('stats.avg', { defaultValue: '平均' })} ${avgRate}%`,
                position: 'insideTopRight',
                fontSize: 9,
                fill: 'var(--muted-foreground)',
              }}
            />
            <Line
              type="monotone"
              dataKey="completion"
              stroke="var(--color-completion)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ChartContainer>
      )}
    </div>
  );
}
