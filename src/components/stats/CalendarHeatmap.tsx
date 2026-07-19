import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '@/store';
import {
  WeekdayHeatmap,
  WeekdayHeatmapBody,
  WeekdayHeatmapBlock,
  WeekdayHeatmapFooter,
  WeekdayHeatmapLegend,
} from '@/components/heatmap/weekday-heatmap';
import type { WeekdayHourlyActivity } from '@/components/heatmap/weekday-heatmap';

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

export function StatsCalendarHeatmap() {
  const { t } = useTranslation();
  const dailyStats = useHealthStore((s) => s.dailyStats);

  const heatMapData = useMemo((): WeekdayHourlyActivity[] => {
    const data: WeekdayHourlyActivity[] = [];

    // 初始化 7×24 网格
    for (let weekday = 0; weekday < 7; weekday++) {
      for (let hour = 0; hour < 24; hour++) {
        data.push({ weekday, hour, value: 0 });
      }
    }

    // 累加所有日的 hourly 数据
    dailyStats.forEach((day) => {
      if (!day.hourly) return;
      const d = new Date(day.date);
      const weekday = d.getDay(); // 0=周日

      for (let hour = 0; hour < 24; hour++) {
        const idx = weekday * 24 + hour;
        data[idx].value +=
          (day.hourly.sitBreaks?.[hour] ?? 0) +
          (day.hourly.waterCups?.[hour] ?? 0) +
          (day.hourly.eyeCare?.[hour] ?? 0) +
          (day.hourly.exercises?.[hour] ?? 0);
      }
    });

    return data;
  }, [dailyStats]);

  const totalCount = useMemo(
    () => heatMapData.reduce((sum, d) => sum + d.value, 0),
    [heatMapData]
  );

  return (
    <div className="flex flex-col" style={{ height: '200px' }}>
      <span className="text-type-caption text-muted-foreground mb-1">
        {t('stats.weeklyPattern', { defaultValue: '每周规律' })}
      </span>

      {totalCount === 0 ? (
        <div className="flex-1 flex items-center justify-center text-type-micro text-muted-foreground">
          {t('stats.noData', { defaultValue: '暂无数据' })}
        </div>
      ) : (
        <WeekdayHeatmap
          data={heatMapData}
          weekStart={1}
          blockSize={18}
          blockMargin={2}
          blockRadius={3}
          levels={5}
          colors={{
            empty: 'var(--muted)',
            scale: 'var(--chart-2)',
          }}
          labels={{
            weekdays: WEEKDAY_NAMES,
          }}
          className="flex-1"
        >
          <WeekdayHeatmapBody>
            {({ activity }) => (
              <WeekdayHeatmapBlock activity={activity} />
            )}
          </WeekdayHeatmapBody>
          <WeekdayHeatmapFooter>
            <WeekdayHeatmapLegend
              labels={{
                less: t('stats.less', { defaultValue: '少' }),
                more: t('stats.more', { defaultValue: '多' }),
              }}
            />
          </WeekdayHeatmapFooter>
        </WeekdayHeatmap>
      )}
    </div>
  );
}
