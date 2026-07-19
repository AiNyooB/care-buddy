import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

export type MiniHeatmapCell = {
  weekday: number; // 0=Mon ... 6=Sun
  period: 'am' | 'pm';
  value: number;
};

export type MiniWeekdayHeatmapProps = {
  dailyStats: { date: string; hourly?: Record<string, number[]> }[];
  levels?: number;
  className?: string;
};

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function getLevel(value: number, max: number, levels: number): number {
  if (value === 0 || max === 0) return 0;
  return Math.min(levels, Math.ceil((value / max) * levels));
}

export function MiniWeekdayHeatmap({
  dailyStats,
  levels = 4,
  className,
}: MiniWeekdayHeatmapProps) {
  const { cells, maxVal } = useMemo(() => {
    const statsMap = new Map(dailyStats.map((d) => [d.date, d]));
    const result: MiniHeatmapCell[] = [];

    for (let i = 0; i < 7; i++) {
      const dateStr = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
      const day = statsMap.get(dateStr);
      const hourly = day?.hourly;

      let am = 0;
      let pm = 0;
      if (hourly) {
        for (let h = 0; h < 12; h++) {
          am += (hourly.sitBreaks?.[h] ?? 0) + (hourly.waterCups?.[h] ?? 0) +
            (hourly.eyeCare?.[h] ?? 0) + (hourly.exercises?.[h] ?? 0);
        }
        for (let h = 12; h < 24; h++) {
          pm += (hourly.sitBreaks?.[h] ?? 0) + (hourly.waterCups?.[h] ?? 0) +
            (hourly.eyeCare?.[h] ?? 0) + (hourly.exercises?.[h] ?? 0);
        }
      }

      result.push({ weekday: i, period: 'am', value: am });
      result.push({ weekday: i, period: 'pm', value: pm });
    }

    const max = result.reduce((m, c) => Math.max(m, c.value), 0);
    return { cells: result, maxVal: max };
  }, [dailyStats]);

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {/* AM 行 */}
      <div className="flex gap-0.5">
        {WEEKDAY_LABELS.map((_, i) => {
          const cell = cells[i * 2];
          const lvl = getLevel(cell.value, maxVal, levels);
          return (
            <div
              key={`am-${i}`}
              className="size-3 rounded-[2px]"
              style={{
                backgroundColor:
                  lvl === 0 ? 'var(--muted)' : `color-mix(in oklch, var(--muted-foreground) ${lvl * 25}%, transparent)`,
              }}
            />
          );
        })}
      </div>

      {/* PM 行 */}
      <div className="flex gap-0.5">
        {WEEKDAY_LABELS.map((_, i) => {
          const cell = cells[i * 2 + 1];
          const lvl = getLevel(cell.value, maxVal, levels);
          return (
            <div
              key={`pm-${i}`}
              className="size-3 rounded-[2px]"
              style={{
                backgroundColor:
                  lvl === 0 ? 'var(--muted)' : `color-mix(in oklch, var(--muted-foreground) ${lvl * 25}%, transparent)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
