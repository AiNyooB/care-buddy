/**
 * 统计数据可视化组件
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useHealthStore } from '../store';
import { Clock, Target } from './Icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';

export function StatsDashboard() {
  const { t } = useTranslation();
  const [dashboardMode, setDashboardMode] = useState<'trend' | 'habits'>('trend');
  const dailyStats = useHealthStore((s) => s.dailyStats);

  // 获取最近7天的数据
  const weeklyData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
      
      const dayData = dailyStats.find((d) => d.date === dateStr);
      days.push({
        date: dayName,
        dateFull: dateStr,
        exercises: dayData?.exercisesCompleted || 0,
        packages: dayData?.packagesCompleted || 0,
        minutes: dayData?.exerciseMinutes || 0,
        sitBreaks: dayData?.sitBreaks || 0,
        waterCups: dayData?.waterCups || 0,
      });
    }
    return days;
  }, [dailyStats]);

  // 获取最近30天的数据（按月统计）
  const monthlyData = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayNum = date.getDate();
      
      const dayData = dailyStats.find((d) => d.date === dateStr);
      days.push({
        date: `${dayNum}${t('stats.day')}`,
        dateFull: dateStr,
        exercises: dayData?.exercisesCompleted || 0,
        packages: dayData?.packagesCompleted || 0,
        minutes: dayData?.exerciseMinutes || 0,
      });
    }
    return days;
  }, [dailyStats]);

  // 计算总计
  const totalStats = useMemo(() => {
    const total = {
      exercises: 0,
      packages: 0,
      minutes: 0,
      sitBreaks: 0,
      waterCups: 0,
    };
    dailyStats.forEach((d) => {
      total.exercises += d.exercisesCompleted;
      total.packages += d.packagesCompleted;
      total.minutes += d.exerciseMinutes;
      total.sitBreaks += d.sitBreaks;
      total.waterCups += d.waterCups;
    });
    return total;
  }, [dailyStats]);

  return (
    <div className="w-full space-y-5">
      {/* 总计卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{t('stats.totalSummary')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-muted p-3 text-center">
              <div className="text-lg font-bold text-primary">{totalStats.exercises}</div>
              <div className="text-xs text-muted-foreground">{t('stats.exercisesCompleted')}</div>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <div className="text-lg font-bold text-primary">{totalStats.packages}</div>
              <div className="text-xs text-muted-foreground">{t('stats.packagesCompleted')}</div>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <div className="text-lg font-bold text-primary">{totalStats.minutes}min</div>
              <div className="text-xs text-muted-foreground">{t('stats.totalExerciseMinutes')}</div>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <div className="text-lg font-bold text-primary">{totalStats.sitBreaks}</div>
              <div className="text-xs text-muted-foreground">{t('stats.sitBreaks')}</div>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <div className="text-lg font-bold text-primary">{totalStats.waterCups}</div>
              <div className="text-xs text-muted-foreground">{t('stats.waterCups')}</div>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <div className="text-lg font-bold text-primary">{dailyStats.length}</div>
              <div className="text-xs text-muted-foreground">{t('stats.recordDays')}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 本周数据 + 本月数据 左右并排 */}
      <div className="grid grid-cols-2 gap-5">
        {/* 本周数据 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Target size={16} />
                {t('stats.weeklyData')}
              </CardTitle>
              <div className="flex gap-1">
                <Toggle
                  size="sm"
                  pressed={dashboardMode === 'trend'}
                  onPressedChange={() => setDashboardMode('trend')}
                  className="rounded-full px-3"
                >
                  {t('stats.weeklyTrend')}
                </Toggle>
                <Toggle
                  size="sm"
                  pressed={dashboardMode === 'habits'}
                  onPressedChange={() => setDashboardMode('habits')}
                  className="rounded-full px-3"
                >
                  {t('stats.weeklyHabits')}
                </Toggle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-4">
            {dashboardMode === 'trend' ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }} />
                  <Legend />
                  <Line type="monotone" dataKey="exercises" name={t('stats.exercisesCompleted')} stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="packages" name={t('stats.packagesCompleted')} stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }} />
                  <Legend />
                  <Bar dataKey="sitBreaks" name={t('stats.sitBreaks')} fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="waterCups" name={t('stats.waterCups')} fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 本月运动时长 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Clock size={16} />
              {t('stats.monthlyMinutes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }} />
                <Bar dataKey="minutes" name={t('stats.totalExerciseMinutes')} fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}