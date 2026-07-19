import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { useHealthStore } from '@/store';
import type { ExerciseCategory } from '@/types';

const CATEGORY_CONFIG: { key: ExerciseCategory; color: string; labelKey: string; labelDefault: string }[] = [
  { key: 'spine', color: 'var(--chart-1)', labelKey: 'categories.spine', labelDefault: '脊柱' },
  { key: 'circulation', color: 'var(--chart-2)', labelKey: 'categories.circulation', labelDefault: '血液' },
  { key: 'metabolism', color: 'var(--chart-3)', labelKey: 'categories.metabolism', labelDefault: '代谢' },
  { key: 'vision', color: 'var(--chart-4)', labelKey: 'categories.vision', labelDefault: '视力' },
  { key: 'wrist', color: 'var(--chart-5)', labelKey: 'categories.wrist', labelDefault: '腕部' },
];

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

export function StatsOverview() {
  const { t } = useTranslation();
  const stats = useHealthStore((s) => s.stats);
  const categoryCounts = useHealthStore((s) => s.categoryExerciseCounts);

  const totalCategories = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  const maxCategory = Math.max(...Object.values(categoryCounts), 1);

  const overviewItems = [
    { value: stats.sitBreaks, labelKey: 'statCards.sitReminder', labelDefault: '久坐提醒' },
    { value: stats.waterCups, labelKey: 'statCards.waterReminder', labelDefault: '喝水提醒' },
    { value: stats.eyeCare, labelKey: 'statCards.eyeCare', labelDefault: '护眼提醒' },
    { value: formatMinutes(stats.totalExerciseMinutes), labelKey: 'stats.exerciseTrend', labelDefault: '运动时长', isText: true },
  ];

  return (
    <div className="flex gap-3" style={{ height: '180px' }}>
      {/* 左侧：累计数字 */}
      <div className="flex flex-col" style={{ width: '40%' }}>
        <span className="text-type-micro text-muted-foreground mb-1">
          {t('stats.totalLabel', { defaultValue: '累计' })}
        </span>
        <div className="grid grid-cols-2 gap-2 flex-1">
          {overviewItems.map((item) => (
            <div key={item.labelKey} className="flex flex-col justify-center">
              <span className="text-type-card-number tabular-nums text-foreground">
                {item.isText ? item.value : item.value.toLocaleString()}
              </span>
              <span className="text-type-micro text-muted-foreground">
                {t(item.labelKey, { defaultValue: item.labelDefault })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 分隔线 */}
      <div className="w-px bg-border self-stretch" />

      {/* 右侧：运动分类 */}
      <div className="flex flex-col" style={{ width: '60%' }}>
        <span className="text-type-micro text-muted-foreground mb-1">
          {t('stats.exerciseCategory', { defaultValue: '运动分类' })}
        </span>
        <div className="flex flex-col gap-2 flex-1 justify-center">
          {CATEGORY_CONFIG.map(({ key, color, labelKey, labelDefault }) => {
            const count = categoryCounts[key] ?? 0;
            const pct = totalCategories > 0 ? (count / maxCategory) * 100 : 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-type-micro text-muted-foreground w-6 shrink-0">
                  {t(labelKey, { defaultValue: labelDefault })}
                </span>
                <div className="flex-1 h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </div>
                <span className="text-type-micro text-muted-foreground w-6 text-right tabular-nums">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
