import { useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import 'number-flow';
import { Pause, Play, RotateCcw, ChevronDown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  pauseTimer,
  resumeTimer,
  timerPauseTask,
  timerResumeTask,
} from '../services';
import { cn } from '@/lib/utils';
import { BorderBeam } from '@/components/ui/border-beam';

const TWO_DIGIT_FORMAT = { minimumIntegerDigits: 2 };

/** React 包装：通过 ref 正确设置 Custom Element 的属性 */
function NumberFlow({
  value,
  trend,
  format,
}: {
  value: number;
  trend?: number;
  format?: Intl.NumberFormatOptions;
}) {
  const ref = useRef<HTMLElement>(null);

  // 首次挂载时设 format / trend（只一次）
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (trend !== undefined) (el as any).trend = trend;
    if (format !== undefined) (el as any).format = format;
  }, [trend, format]);

  // value 变化时通过 update() 触发（只有 getter）
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    (el as any).update(value);
  }, [value]);

  return <number-flow ref={ref} />;
}

function formatDurationUnit(seconds: number, t: ReturnType<typeof useTranslation>['t']) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return (
      <span className="flex items-baseline gap-0.5">
        <span>{h}</span>
        <span className="text-type-caption text-muted-foreground">
          {t('dashboard.durationHoursMinutes', { defaultValue: '小时' })}
        </span>
        <span>{m}</span>
        <span className="text-type-caption text-muted-foreground">
          {t('dashboard.durationMinutes', { defaultValue: '分钟' })}
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-baseline gap-0.5">
      <span>{m}</span>
      <span className="text-type-caption text-muted-foreground">
        {t('dashboard.durationMinutes', { defaultValue: '分钟' })}
      </span>
    </span>
  );
}

export function CountdownSection() {
  const { t } = useTranslation();
  const tasks = useHealthStore((s) => s.tasks);
  const taskStates = useHealthStore((s) => s.taskStates);
  const isPaused = useHealthStore((s) => s.isPaused);
  const setPaused = useHealthStore((s) => s.setPaused);
  const pauseTask = useHealthStore((s) => s.pauseTask);
  const resumeTask = useHealthStore((s) => s.resumeTask);
  const resetAllTasks = useHealthStore((s) => s.resetAllTasks);

  const cardsPerPage = 3;
  const cardPage = useHealthStore((s) => s.cardPage);
  const setCardPage = useHealthStore((s) => s.setCardPage);

  // 右侧卡片区折叠状态（存于 store 跨页面切换保持）
  const rightCollapsed = useHealthStore((s) => s.rightCollapsed);
  const setRightCollapsed = useHealthStore((s) => s.setRightCollapsed);

  const enabledTasks = useMemo(() => tasks.filter((t) => t.enabled), [tasks]);

  // 主计时卡：显示倒计时最短的活跃提醒
  const mainTask = useMemo(() => {
    if (enabledTasks.length === 0) return null;
    return enabledTasks.reduce((best, task) => {
      const ts = taskStates[task.id];
      const remaining = ts?.countdown ?? task.interval * 60;
      if (!best || remaining < best.remaining) {
        return { task, remaining };
      }
      return best;
    }, null as { task: typeof enabledTasks[0]; remaining: number } | null);
  }, [enabledTasks, taskStates]);

  // 即将提醒：下一个进入预通知窗口的任务
  const upcomingTask = useMemo(() => {
    return enabledTasks.reduce((best, task) => {
      const ts = taskStates[task.id];
      const remaining = ts?.countdown ?? task.interval * 60;
      if (remaining <= 0) return best;
      if (!best || remaining < best.remaining) {
        return { task, remaining };
      }
      return best;
    }, null as { task: typeof enabledTasks[0]; remaining: number } | null);
  }, [enabledTasks, taskStates]);

  // 状态统计
  const runningCount = enabledTasks.filter((t) => {
    const ts = taskStates[t.id];
    return ts && !ts.paused && !isPaused && ts.countdown > 0;
  }).length;
  const pausedCount = enabledTasks.filter((t) => {
    const ts = taskStates[t.id];
    return ts?.paused || isPaused;
  }).length;

  // 卡片分页
  const totalCardPages = Math.ceil(enabledTasks.length / cardsPerPage);
  const startIndex = (cardPage - 1) * cardsPerPage;
  const currentCards = enabledTasks.slice(startIndex, startIndex + cardsPerPage);

  // 单提醒时：合并显示，不渲染右侧卡片列表
  const showCardList = enabledTasks.length > 1;
  // 折叠按钮只在 showCardList 为 true 时出现，此时手动折叠优先于自动展开
  const mainCardWidth = !showCardList || rightCollapsed
    ? 'var(--grid-content)'
    : 'calc(var(--grid-col)*4 + var(--grid-gap)*3)';

  const mainProgress = mainTask
    ? 1 - mainTask.remaining / (mainTask.task.interval * 60)
    : 0;

  const handleTogglePause = async (taskId: string) => {
    const ts = taskStates[taskId];
    if (!ts) return;
    try {
      if (ts.paused) {
        await timerResumeTask(taskId);
        resumeTask(taskId);
      } else {
        await timerPauseTask(taskId);
        pauseTask(taskId);
      }
    } catch {
      console.warn('timer toggle failed, state unchanged');
    }
  };

  const handleGlobalPause = async () => {
    if (isPaused) {
      setPaused(false);
      await resumeTimer().catch(console.warn);
    } else {
      setPaused(true);
      await pauseTimer().catch(console.warn);
    }
  };

  return (
    <div className="relative" style={{ height: '246px' }}>
      {/* ================================================================ */}
      {/* 标题行 — 绝对定位 */}
      {/* ================================================================ */}
      <div
        className="absolute top-0 left-0 flex items-center justify-between"
        style={{ width: 'var(--grid-content)', height: '24px' }}
      >
        <div className="flex items-center gap-1">
          <h2 className="text-type-card-title font-semibold text-foreground">
            {t('dashboard.countdown', { defaultValue: '倒计时' })}
          </h2>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center">
              <Button
                variant="outline"
                size="icon-xs"
                className="rounded-md border-[#ebebeb] [&_svg]:size-3"
                tabIndex={-1}
              >
                <ChevronDown strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleGlobalPause}>
                {isPaused ? (
                  <>
                    <Play size={14} />
                    {t('dashboard.resumeAll', { defaultValue: '继续所有提醒' })}
                  </>
                ) : (
                  <>
                    <Pause size={14} />
                    {t('dashboard.pauseAll', { defaultValue: '暂停所有提醒' })}
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => resetAllTasks()}>
                <RotateCcw size={14} />
                {t('dashboard.resetAll', { defaultValue: '重置所有提醒' })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 右侧：折叠按钮 + 分页器 */}
        <div className="flex items-center gap-2">
          {showCardList && (
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => setRightCollapsed(!rightCollapsed)}
              className="rounded-md border-[#ebebeb] mr-1"
            >
              <ArrowRight
                strokeWidth={1.5}
                className={cn(
                  'transition-transform duration-300 ease-in-out',
                  rightCollapsed && 'rotate-180'
                )}
              />
            </Button>
          )}

          {/* 分页器 — 只有 >1 页且右侧展开时显示 */}
          {!rightCollapsed && totalCardPages > 1 && (
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                {Array.from({ length: totalCardPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      isActive={page === cardPage}
                      onClick={() => setCardPage(page)}
                      size="icon-xs"
                      className={cn(
                        'rounded-md',
                        page === cardPage && 'border border-[#ebebeb]'
                      )}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* 主计时卡 — 绝对定位 */}
      {/* ================================================================ */}
      <Card
        className="absolute overflow-hidden ring-0 transition-[width] duration-300 ease-in-out"
        style={{
          top: 'calc(24px + var(--grid-gap))',
          left: 0,
          width: mainCardWidth,
          height: '210px',
          borderRadius: '14px',
          padding: '12px',
        }}
      >
        {/* 状态指示 — 居中于计时器盒上方 */}
        <div
          className="absolute flex items-center justify-center gap-2 -translate-x-1/2"
          style={{ top: '30px', left: '50%', width: '192px' }}
        >
          {enabledTasks.length === 0 ? (
            <span className="text-type-caption text-muted-foreground whitespace-nowrap">
              {t('dashboard.enableRemindersHint', { defaultValue: '请在设置中开启提醒' })}
            </span>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <span className="size-2 shrink-0 rounded-full bg-[#2da44e]" />
                <span className="text-type-caption text-muted-foreground">
                  {t('dashboard.runningReminders', { count: runningCount, defaultValue: '{{count}}个' })}
                </span>
              </div>
              {pausedCount > 0 && (
                <div className="flex items-center gap-1">
                  <span className="size-2 shrink-0 rounded-full bg-[#f97716]" />
                  <span className="text-type-caption text-muted-foreground">
                    {t('dashboard.pausedReminders', { count: pausedCount, defaultValue: '{{count}}个' })}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 计时器盒 */}
        <div
          className="absolute flex flex-col items-center justify-center rounded-2xl bg-card shadow-md ring-1 ring-border overflow-hidden -translate-x-1/2"
          style={{ top: '60px', left: '50%', width: '192px', height: '88px' }}
        >
          {mainTask && (
            <BorderBeam
              duration={3}
              colorFrom="#22c55e"
              colorTo="#3b82f6"
              spring
            />
          )}
          {mainTask ? (
            <div className="flex items-baseline text-type-timer-number font-bold text-foreground tabular-nums relative z-10">
              {(() => {
                const h = Math.floor(mainTask.remaining / 3600);
                const m = Math.floor((mainTask.remaining % 3600) / 60);
                const s = mainTask.remaining % 60;
                return (
                  <>
                    {h > 0 && (
                      <>
                        <NumberFlow value={h} trend={-1} format={TWO_DIGIT_FORMAT} />
                        <span className="-mx-0.5">:</span>
                      </>
                    )}
                    <NumberFlow value={m} trend={-1} format={TWO_DIGIT_FORMAT} />
                    <span className="-mx-0.5">:</span>
                    <NumberFlow value={s} trend={-1} format={TWO_DIGIT_FORMAT} />
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 relative z-10">
              <span className="text-type-timer-number font-bold text-muted-foreground/40 tabular-nums tracking-[4px]">
                --:--
              </span>
              <span className="text-type-body text-muted-foreground whitespace-nowrap">
                {t('dashboard.noActiveReminders', { defaultValue: '暂无进行中的提醒' })}
              </span>
            </div>
          )}
          {mainTask && (
            <span className="text-type-caption text-muted-foreground relative z-10">
              {t('dashboard.remainingPercent', { percent: Math.round((1 - mainProgress) * 100), defaultValue: '剩余{{percent}}%' })}
            </span>
          )}
        </div>

        {/* 当前任务标签 — 与计时器盒居中对齐 */}
        {upcomingTask && (
          <div
            className="absolute flex items-center justify-center gap-1 -translate-x-1/2"
            style={{ top: '160px', left: '50%', width: '192px' }}
          >
            <span className="text-type-body text-muted-foreground">
              {t('dashboard.upcoming', { defaultValue: '当前:' })}
            </span>
            <span className="text-type-body text-foreground">
              {t('taskNames.' + upcomingTask.task.id, { defaultValue: upcomingTask.task.title })}
            </span>
          </div>
        )}
      </Card>

      {/* ================================================================ */}
      {/* 提醒卡片区 — 绝对定位（单提醒时合并显示，不渲染此区域） */}
      {/* ================================================================ */}
      {showCardList && (
      <div
        className="absolute overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          top: 'calc(24px + var(--grid-gap))',
          left: 'calc(var(--grid-col)*4 + var(--grid-gap)*4)',
          width: rightCollapsed ? '0px' : 'calc(var(--grid-col)*2 + var(--grid-gap))',
          opacity: rightCollapsed ? 0 : 1,
          height: '210px',
        }}
      >
        {currentCards.map((task, index) => {
          const ts = taskStates[task.id];
          const remaining = ts?.countdown ?? task.interval * 60;
          const progress = 1 - remaining / (task.interval * 60);
          const taskPaused = ts?.paused || isPaused;

          return (
            <Card
              key={task.id}
              className={cn(
                'absolute border border-border !ring-0 rounded-[10px] p-2',
                taskPaused && 'border-warning outline-1 outline-offset-[-1px] outline-warning/30'
              )}
              style={{
                top: `${index * 74}px`,
                left: 0,
                width: 'calc(var(--grid-col)*2 + var(--grid-gap))',
                height: '62px',
              }}
            >
              <div className="flex h-full flex-col justify-between">
                {/* 第一行：计时 + 暂停按钮 */}
                <div className="flex items-center justify-between">
                  <span className="text-type-card-number font-semibold text-muted-foreground tabular-nums leading-[var(--type-card-number-lh)]">
                    {formatDurationUnit(remaining, t)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleTogglePause(task.id)}
                  >
                    {taskPaused ? <Play size={12} /> : <Pause size={12} />}
                  </Button>
                </div>
                {/* 第二行：任务名 + 百分比/已暂停（互显） */}
                <div className="flex items-center justify-between">
                  <span className="text-type-body text-muted-foreground leading-[var(--type-body-lh)]">
                    {t('taskNames.' + task.id, { defaultValue: task.title })}
                  </span>
                  {taskPaused ? (
                    <span className="text-type-caption font-medium text-warning leading-[var(--type-caption-lh)]">
                      {t('dashboard.paused', { defaultValue: '已暂停' })}
                    </span>
                  ) : (
                    <span className="text-type-caption text-muted-foreground leading-[var(--type-caption-lh)]">
                      {Math.round((1 - progress) * 100)}%
                    </span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}