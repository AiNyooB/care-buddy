import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Target, BarChart3, EllipsisVertical } from 'lucide-react';
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { useHealthStore } from '../store';
import { computeStreak, getYesterdayStats } from '@/utils/time';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { MiniWeekdayHeatmap } from '@/components/heatmap/MiniWeekdayHeatmap';
import { GoalEditDialog } from './stats/GoalEditDialog';
import type { ExerciseCategory } from '../types';

const CATEGORIES: ExerciseCategory[] = ['spine', 'circulation', 'metabolism', 'vision', 'wrist'];

// 半圆环配置：外到内
const RING_CONFIG = [
  { key: 'sitBreaks' as const, color: 'var(--chart-1)', labelKey: 'statCards.sitReminder' },
  { key: 'eyeCare' as const, color: 'var(--chart-3)', labelKey: 'statCards.eyeCare' },
  { key: 'waterCups' as const, color: 'var(--chart-4)', labelKey: 'statCards.waterReminder' },
  { key: 'exercises' as const, color: 'var(--chart-2)', labelKey: 'statCards.exercise2' },
] as const;

// 昨日对比 diff 格式化
function formatDiff(diff: number): { symbol: string; className: string } | null {
  if (diff === 0) return null;
  if (diff > 0) return { symbol: `↑${diff}`, className: 'text-foreground' };
  return { symbol: `↓${Math.abs(diff)}`, className: 'text-foreground' };
}

// ============================================================================
// 子组件：迷你柱状图
// ============================================================================
function MiniBarChart({ categoryCounts }: { categoryCounts: Record<string, number> }) {
  const maxVal = useMemo(
    () => Math.max(...CATEGORIES.map((c) => categoryCounts[c] ?? 0), 1),
    [categoryCounts],
  );
  const hasData = CATEGORIES.some((c) => (categoryCounts[c] ?? 0) > 0);

  return (
    <div className="flex items-end gap-1" style={{ height: '40px' }}>
      {CATEGORIES.map((cat, i) => {
        const val = categoryCounts[cat] ?? 0;
        const h = hasData ? Math.max(4, (val / maxVal) * 40) : 40;
        return (
          <motion.div
            key={cat}
            className="rounded-xs"
            style={{
              width: '8px',
              height: `${h}px`,
              backgroundColor: val > 0 ? 'var(--muted-foreground)' : 'var(--muted)',
            }}
            initial={{ height: '4px' }}
            animate={{ height: `${h}px` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.05 }}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// 子组件：进度条
// ============================================================================
function MetricProgressBar({
  value,
  goal,
  color,
  delay = 0,
}: {
  value: number;
  goal: number;
  color: string;
  delay?: number;
}) {
  const percent = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;

  return (
    <div className="h-1.5 w-full rounded-full overflow-hidden bg-muted">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: '0%' }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.6, ease: 'easeOut', delay }}
      />
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================
export function HealthMetricsSection() {
  const { t } = useTranslation();
  const todayStats = useHealthStore((s) => s.todayStats);
  const dailyStats = useHealthStore((s) => s.dailyStats);
  const dailyGoals = useHealthStore((s) => s.dailyGoals);
  const setDailyGoals = useHealthStore((s) => s.setDailyGoals);
  const resetDailyGoals = useHealthStore((s) => s.resetDailyGoals);

  const [goalEditOpen, setGoalEditOpen] = useState(false);

  // 连续天数
  const streak = useMemo(() => computeStreak(dailyStats), [dailyStats]);

  // 昨日数据
  const yesterday = useMemo(() => getYesterdayStats(dailyStats), [dailyStats]);

  // 半圆环进度计算
  const ringProgress = useMemo(() => {
    const map: Record<string, number> = {
      sitBreaks: todayStats.sitBreaks,
      eyeCare: todayStats.eyeCare,
      waterCups: todayStats.waterCups,
      exercises: todayStats.exercisesCompleted,
    };
    return RING_CONFIG.map((ring) => {
      const goal = dailyGoals[ring.key];
      if (goal <= 0) return 0;
      return Math.min((map[ring.key] ?? 0) / goal, 1);
    });
  }, [todayStats, dailyGoals]);

  // 运动卡片 diff
  const exerciseDiff = useMemo(() => {
    if (!yesterday) return null;
    return (todayStats.exercisesCompleted ?? 0) - (yesterday.exercisesCompleted ?? 0);
  }, [todayStats.exercisesCompleted, yesterday]);

  // 第四行 3 卡数据
  const metricCards = useMemo(() => {
    const keys = [
      { storeKey: 'sitBreaks' as const, labelKey: 'statCards.sitReminder', color: 'var(--muted-foreground)' },
      { storeKey: 'eyeCare' as const, labelKey: 'statCards.eyeCare', color: 'var(--muted-foreground)' },
      { storeKey: 'waterCups' as const, labelKey: 'statCards.waterReminder', color: 'var(--muted-foreground)' },
    ];
    return keys.map(({ storeKey, labelKey, color }) => {
      const value = todayStats[storeKey] as number;
      const goal = dailyGoals[storeKey];
      const diff = yesterday ? value - ((yesterday as unknown as Record<string, number>)[storeKey] ?? 0) : null;
      return { storeKey, labelKey, color, value, goal, diff };
    });
  }, [todayStats, dailyGoals, yesterday]);

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3" style={{ width: 'var(--grid-content)' }}>
      {/* ================================================================ */}
      {/* 第一行：标题行 */}
      {/* ================================================================ */}
      <div className="flex h-6 items-center justify-between">
        <h2 className="text-type-page-title text-foreground">
          {t('statCards.healthMetrics', { defaultValue: '健康指标' })}
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none hover:bg-muted hover:text-foreground text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <EllipsisVertical strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setGoalEditOpen(true)}>
              <Target size={14} />
              {t('statCards.goalSettings', { defaultValue: '指标设定' })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ================================================================ */}
      {/* 第二行：Hero 半圆环 */}
      {/* ================================================================ */}
      <div className="flex flex-1 justify-center items-stretch w-full" style={{ minHeight: '100px' }}>
        <ResponsiveContainer width="100%" height="100%">
          {/* 半圆环显示模式：
            - cy="100%" 圆心在容器底部，圆环向上展开
            - startAngle=180 / endAngle=0 → 上半圆弧（180°→0°），圆心在底部向上展开
            - innerRadius/outerRadius 必须用绝对像素值，不能用百分比
              百分比相对于 maxRadius=min(w,h)/2 计算，容器非正方形时圆环会异常缩小
            - outerRadius 不得超过容器高度，否则顶部被裁切
            - minHeight: 100px 保护 outerRadius=100 不被 flex 压缩裁切 */}
          <RadialBarChart
            startAngle={180}
            endAngle={0}
            innerRadius={24}
            outerRadius={100}
            cx="50%"
            cy="100%"
            data={RING_CONFIG.map((ring, i) => ({
              name: ring.labelKey,
              progress: ringProgress[i] * 100,
              fill: ring.color,
            }))}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              background={{ fill: 'var(--muted)' }}
              dataKey="progress"
              cornerRadius={4}
              isAnimationActive={true}
              animationDuration={800}
              animationEasing="ease-out"
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

      {/* ================================================================ */}
      {/* 第三行：连续天数 + 运动 */}
      {/* ================================================================ */}
      <div className="flex gap-3">
        {/* 连续天数卡片 */}
        <Card
          className="flex flex-1 flex-row items-end justify-between !p-3"
          style={{ borderRadius: '10px' }}
        >
          <div className="flex flex-col">
            <div className="flex items-baseline gap-0.5">
              <span className="text-type-card-number text-foreground tabular-nums">
                {streak}
              </span>
              <span className="text-type-caption text-muted-foreground">
                {t('dashboard.days', { defaultValue: '天' })}
              </span>
            </div>
            <span className="text-type-body text-muted-foreground">
              {t('statCards.streakDays2', { defaultValue: '连续天数' })}
            </span>
          </div>
          <MiniWeekdayHeatmap dailyStats={dailyStats} />
        </Card>

        {/* 运动卡片 */}
        <Card
          className="flex flex-1 flex-row items-end gap-3 !p-3"
          style={{ borderRadius: '14px' }}
        >
          {/* 左侧：数字 + 标题 */}
          <div className="flex flex-col gap-0.5" style={{ width: '55%' }}>
            <div className="flex items-baseline gap-1">
              <span className="text-type-card-number text-foreground tabular-nums">
                {todayStats.exercisesCompleted}
              </span>
              <span className="text-type-caption text-muted-foreground">
                /
                {dailyGoals.exercises > 0 ? dailyGoals.exercises : '–'}
              </span>
              <span className="text-type-caption text-muted-foreground">
                {t('dashboard.times', { defaultValue: '次' })}
              </span>
              {exerciseDiff !== null && (() => {
                const d = formatDiff(exerciseDiff);
                return d ? (
                  <span className={cn('text-type-caption font-medium', d.className)}>{d.symbol}</span>
                ) : null;
              })()}
            </div>
            <span className="text-type-body text-muted-foreground">
              {t('statCards.exercise2', { defaultValue: '运动' })}
            </span>
          </div>
          {/* 右侧：迷你柱状图 */}
          <div className="flex items-center justify-end" style={{ width: '45%' }}>
            <MiniBarChart categoryCounts={todayStats.categoryCounts} />
          </div>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* 第四行：久坐/护眼/喝水 */}
      {/* ================================================================ */}
      <div className="flex gap-3">
        {metricCards.map(({ labelKey, color, value, goal, diff }, idx) => (
          <Card
            key={labelKey}
            className="flex flex-1 flex-col gap-1.5 !p-3"
            style={{ borderRadius: '10px' }}
          >
            <span className="text-type-body text-foreground">
              {t(labelKey)}
            </span>
            <div className="flex flex-col">
              <MetricProgressBar
                value={value}
                goal={goal}
                color={color}
                delay={idx * 0.1}
              />
              <div className="flex items-baseline gap-1">
                <span className="text-type-card-number text-foreground tabular-nums">
                  {value}
                </span>
                {goal > 0 ? (
                  <>
                    <span className="text-type-caption text-muted-foreground">
                      /{goal}
                    </span>
                    <span className="text-type-caption text-muted-foreground">
                      {t('dashboard.times', { defaultValue: '次' })}
                    </span>
                  </>
                ) : (
                  <span className="text-type-caption text-muted-foreground">
                    {t('statCards.noGoal', { defaultValue: '未设目标' })}
                  </span>
                )}
                {diff !== null && (() => {
                  const d = formatDiff(diff);
                  return d ? (
                    <span className={cn('text-type-caption font-medium ml-auto', d.className)}>{d.symbol}</span>
                  ) : null;
                })()}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <GoalEditDialog
        open={goalEditOpen}
        onOpenChange={setGoalEditOpen}
        goals={dailyGoals}
        onSave={(g) => {
          setDailyGoals(g);
          setGoalEditOpen(false);
        }}
        onReset={() => {
          resetDailyGoals();
          setGoalEditOpen(false);
        }}
      />
    </div>
  );
}
