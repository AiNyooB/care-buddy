import type { GoalKey } from '@/types';

export interface GoalRowConfig {
  key: GoalKey;
  color: string;
  labelKey: string;
  labelDefault: string;
}

export const GOAL_ROW_CONFIG: GoalRowConfig[] = [
  { key: 'sitBreaks', color: 'var(--chart-1)', labelKey: 'statCards.sitReminder', labelDefault: '久坐' },
  { key: 'eyeCare', color: 'var(--chart-3)', labelKey: 'statCards.eyeCare', labelDefault: '护眼' },
  { key: 'waterCups', color: 'var(--chart-4)', labelKey: 'statCards.waterReminder', labelDefault: '喝水' },
  { key: 'exercises', color: 'var(--chart-2)', labelKey: 'stats.thisWeekExercises', labelDefault: '运动' },
];
