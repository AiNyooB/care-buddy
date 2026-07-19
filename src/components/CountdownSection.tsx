import { useMemo, useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emit } from '@tauri-apps/api/event';
import { useHealthStore } from '../store';
import 'number-flow';
import { Pause, Play, RotateCcw, EllipsisVertical, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  pauseTimer,
  resumeTimer,
} from '../services';
import { cn } from '@/lib/utils';
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar';
import { motion, AnimatePresence } from 'motion/react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';

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
  const isIdle = useHealthStore((s) => s.isIdle);
  const setPaused = useHealthStore((s) => s.setPaused);
  const pauseTask = useHealthStore((s) => s.pauseTask);
  const resumeTask = useHealthStore((s) => s.resumeTask);
  const resetAllTasks = useHealthStore((s) => s.resetAllTasks);
  const entertainmentActive = useHealthStore((s) => s.entertainmentActive);
  const entertainmentCountdown = useHealthStore((s) => s.entertainmentCountdown);

  const cardsPerPage = 3;

  // 右侧卡片区折叠状态（存于 store 跨页面切换保持）
  const rightCollapsed = useHealthStore((s) => s.rightCollapsed);
  const setRightCollapsed = useHealthStore((s) => s.setRightCollapsed);

  // 分页状态
  const [activePage, setActivePage] = useState(0);

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
  // 运行中数量：未暂停的任务都算（包括 countdown=0 的触发态）
  const runningCount = enabledTasks.filter((t) => {
    const ts = taskStates[t.id];
    return ts && !ts.paused && !isPaused;
  }).length;
  const pausedCount = enabledTasks.filter((t) => {
    const ts = taskStates[t.id];
    return ts?.paused || isPaused;
  }).length;

  // 卡片列表
  const sideTasks = useMemo(() => enabledTasks, [enabledTasks]);
  const totalCardPages = Math.ceil(sideTasks.length / cardsPerPage);

  // 任务减少时 clamp activePage，避免越界显示空白
  useEffect(() => {
    setActivePage(p => Math.min(p, Math.max(0, totalCardPages - 1)));
  }, [totalCardPages]);

  // 当前页显示的卡片
  const currentPageTasks = useMemo(() => {
    const start = activePage * cardsPerPage;
    return sideTasks.slice(start, start + cardsPerPage);
  }, [sideTasks, activePage, cardsPerPage]);

  // 单提醒时：合并显示，不渲染右侧卡片列表
  const showCardList = enabledTasks.length > 1;
  // 折叠按钮只在 showCardList 为 true 时出现，此时手动折叠优先于自动展开
  const mainCardWidth = !showCardList || rightCollapsed
    ? 'var(--grid-content)'
    : 'calc(var(--grid-col)*4 + var(--grid-gap)*3)';

  // 倒计时语义：满→空（剩余百分比）。snooze/重置到未来时 remaining 可能 > total，钳制到 [0,100] 避免圆环溢出（#3）
  const remainingPercent = mainTask
    ? Math.min(100, Math.max(0, (mainTask.remaining / (mainTask.task.interval * 60)) * 100))
    : 0;

  // 调试日志：主计时卡状态
  useEffect(() => {
    const taskDetails = enabledTasks.map(t => {
      const ts = taskStates[t.id];
      return `${t.id}=倒计时${ts?.countdown ?? '无'}状态${ts?.status ?? '无'}`;
    }).join(', ');
    // console.log('[主计时卡] 当前任务:', mainTask?.task.id ?? '(无)', '剩余:', mainTask?.remaining ?? '(无)');
    // console.log('[主计时卡] 运行中:', runningCount, '各任务:', taskDetails);
  }, [mainTask, runningCount, enabledTasks, taskStates]);

  const handleTogglePause = async (taskId: string) => {
    const ts = taskStates[taskId];
    if (!ts) return;
    // store action 内部调 IPC + 错误处理
    if (ts.paused) {
      await resumeTask(taskId);
    } else {
      await pauseTask(taskId);
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

  const handleResetAll = async () => {
    // store action 内部调 IPC + 错误处理，返回 boolean 表示是否成功
    const ok = await resetAllTasks();
    // 仅在 reset 成功时通知浮窗清空触发态队列
    if (ok) emit('floating-reset-all', {});
  };

  // ── 娱乐模式视图：独立倒计时单卡 ──
  if (entertainmentActive) {
    const entRemaining = entertainmentCountdown?.remaining ?? 0;
    const entTotal = entertainmentCountdown?.total ?? 0;
    const entPercent = entTotal > 0 ? Math.min(100, Math.max(0, (entRemaining / entTotal) * 100)) : 0;
    const entMinutes = Math.floor(entRemaining / 60);
    const entSeconds = entRemaining % 60;

    return (
      <div className="relative" style={{ height: '278px' }}>
        {/* 标题行 */}
        <div
          className="absolute top-0 left-0 flex items-center justify-between"
          style={{ width: 'var(--grid-content)', height: '24px' }}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-type-page-title text-foreground">
              {t('dashboard.entertainmentMode', { defaultValue: '娱乐模式' })}
            </h2>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex size-7 shrink-0 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none hover:bg-muted hover:text-foreground text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
              <EllipsisVertical strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
              <DropdownMenuItem onClick={handleResetAll}>
                <RotateCcw size={14} />
                {t('dashboard.resetAll', { defaultValue: '重置所有提醒' })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 独立倒计时卡片 */}
        <Card
          className="absolute overflow-hidden ring-0 flex flex-col gap-3"
          style={{
            top: 'calc(24px + var(--grid-gap))',
            left: 0,
            width: 'var(--grid-content)',
            height: '242px',
            borderRadius: '14px',
            padding: '0 12px',
          }}
        >
          {/* 状态指示器 */}
          <div className="flex items-center justify-center gap-1.5 h-5 shrink-0">
            <Badge variant="default" className="bg-success/15 text-success border-success/30">
              {t('dashboard.entertainmentActive', { defaultValue: '娱乐中' })}
            </Badge>
          </div>

          {/* 圆环 */}
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <AnimatedCircularProgressBar
              value={entPercent}
              max={100}
              min={0}
              gaugePrimaryColor="var(--foreground)"
              gaugeSecondaryColor="var(--muted)"
              className="size-full max-h-full"
            >
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-baseline text-type-timer-number text-foreground tabular-nums">
                  <NumberFlow value={entMinutes} trend={-1} format={TWO_DIGIT_FORMAT} />
                  <span className="-mx-0.5">:</span>
                  <NumberFlow value={entSeconds} trend={-1} format={TWO_DIGIT_FORMAT} />
                </div>
                <span className="text-type-caption text-muted-foreground">
                  {t('dashboard.nextReminder', { defaultValue: '下次提醒' })}
                </span>
              </div>
            </AnimatedCircularProgressBar>
          </div>

          {/* 底部标签 */}
          <div className="flex items-center justify-center gap-1 h-5 shrink-0">
            <span className="text-type-caption text-muted-foreground">
              {t('dashboard.entertainmentHint', { defaultValue: '到点提醒一次休息' })}
            </span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: '278px' }}>
      {/* ================================================================ */}
      {/* 标题行 — 绝对定位 */}
      {/* ================================================================ */}
      <div
        className="absolute top-0 left-0 flex items-center justify-between"
        style={{ width: 'var(--grid-content)', height: '24px' }}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-type-page-title text-foreground">
            {t('dashboard.countdown', { defaultValue: '倒计时' })}
          </h2>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none hover:bg-muted hover:text-foreground text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <EllipsisVertical strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
            <DropdownMenuItem onClick={handleResetAll}>
              <RotateCcw size={14} />
              {t('dashboard.resetAll', { defaultValue: '重置所有提醒' })}
            </DropdownMenuItem>
            {showCardList && (
              <DropdownMenuItem onClick={() => setRightCollapsed(!rightCollapsed)}>
                {rightCollapsed ? <Play size={14} /> : <Pause size={14} />}
                {rightCollapsed
                  ? t('dashboard.showAll', { defaultValue: '查看全部' })
                  : t('dashboard.showLess', { defaultValue: '查看更少' })}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ================================================================ */}
      {/* 主计时卡 — 绝对定位 */}
      {/* ================================================================ */}
      <Card
        className="absolute overflow-hidden ring-0 transition-[width] duration-300 ease-in-out flex flex-col gap-3"
        style={{
          top: 'calc(24px + var(--grid-gap))',
          left: 0,
          width: mainCardWidth,
          height: '242px',
          borderRadius: '14px',
          padding: '0 12px',
        }}
      >
        {/* 圆环外上方：状态指示器 */}
        <div className="flex items-center justify-center gap-1.5 h-5 shrink-0">
          {enabledTasks.length === 0 ? (
            <span className="text-type-caption text-muted-foreground whitespace-nowrap">
              {t('dashboard.enableRemindersHint', { defaultValue: '请在设置中开启提醒' })}
            </span>
          ) : isIdle ? (
            // 空闲时只显示「空闲中」，隐藏绿点(运行中)/黄点(暂停)数量
            <Badge variant="default">
              {t('dashboard.idle', { defaultValue: '空闲中' })}
            </Badge>
          ) : (
            <>
              <span className="size-2 shrink-0 rounded-full bg-success" />
              <span className="text-type-caption text-muted-foreground">
                {t('dashboard.runningReminders', { count: runningCount, defaultValue: '{{count}}个' })}
              </span>
              {pausedCount > 0 && (
                <>
                  <span className="size-2 shrink-0 rounded-full bg-warning" />
                  <span className="text-type-caption text-muted-foreground">
                    {t('dashboard.pausedReminders', { count: pausedCount, defaultValue: '{{count}}个' })}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* 圆环（缩小，填充剩余空间） */}
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <AnimatedCircularProgressBar
            value={remainingPercent}
            max={100}
            min={0}
            gaugePrimaryColor="var(--foreground)"
            gaugeSecondaryColor="var(--muted)"
            className="size-full max-h-full"
          >
            <div className="flex flex-col items-center gap-1">
              {/* 倒计时数字 */}
              {mainTask ? (
                <div className="flex items-baseline text-type-timer-number text-foreground tabular-nums">
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
                <span className="text-type-timer-number text-muted-foreground/40 tabular-nums tracking-[4px]">
                  --:--
                </span>
              )}

              {/* 剩余百分比 */}
              {mainTask ? (
                <span className="text-type-caption text-muted-foreground">
                  {t('dashboard.remainingPercent', { percent: Math.round(remainingPercent), defaultValue: '剩余{{percent}}%' })}
                </span>
              ) : (
                <span className="text-type-body text-muted-foreground whitespace-nowrap">
                  {t('dashboard.noActiveReminders', { defaultValue: '暂无进行中的提醒' })}
                </span>
              )}
            </div>
          </AnimatedCircularProgressBar>
        </div>

        {/* 圆环外下方：当前任务标签 */}
        <div className="flex items-center justify-center gap-1 h-5 shrink-0">
          {upcomingTask ? (
            <>
              <span className="shrink-0 text-type-caption text-muted-foreground">
                {t('dashboard.upcoming', { defaultValue: '当前:' })}
              </span>
              <span className="min-w-0 max-w-[72px] truncate text-type-caption text-foreground">
                {t('taskNames.' + upcomingTask.task.id, { defaultValue: upcomingTask.task.title })}
              </span>
            </>
          ) : mainTask ? (
            <span className="text-type-caption text-muted-foreground">
              {t('taskNames.' + mainTask.task.id, { defaultValue: mainTask.task.title })}
            </span>
          ) : null}
        </div>
      </Card>

      {/* ================================================================ */}
      {/* 胶囊指示器 — 独立元素，放在列4右侧 */}
      {/* ================================================================ */}
      {/* 提醒卡片区 — 绝对定位（单提醒时合并显示，不渲染此区域） */}
      {/* ================================================================ */}
      {showCardList && (
      <div
        className="absolute transition-all duration-300 ease-in-out flex flex-col"
        style={{
          top: 'calc(24px + var(--grid-gap))',
          left: 'calc(var(--grid-col)*4 + var(--grid-gap)*4)',
          width: rightCollapsed ? '0px' : 'calc(var(--grid-col)*2 + var(--grid-gap))',
          opacity: rightCollapsed ? 0 : 1,
          height: '242px',
        }}
      >
        {/* 卡片区域：始终 flex-1 撑满，分页器 shrink-0 沉底；多页置顶、单页居中 */}
        <div
          className={cn(
            'min-h-0 gap-3 flex-1 flex flex-col',
            totalCardPages > 1 ? 'justify-start' : 'justify-center'
          )}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-3"
            >
              {currentPageTasks.map((task) => {
                const ts = taskStates[task.id];
                const remaining = ts?.countdown ?? task.interval * 60;
                // snooze/重置到未来时 remaining 可能 > total，钳制到 [0,1] 避免进度条反向/异常（#3）
                const progress = Math.min(1, Math.max(0, 1 - remaining / (task.interval * 60)));
                const taskPaused = ts?.paused || isPaused;

                return (
                  <Card
                    key={task.id}
                    className={cn(
                      'border border-border !ring-0 rounded-[10px] p-2',
                      taskPaused && 'border-warning outline-1 outline-offset-[-1px] outline-warning/30'
                    )}
                    style={{
                      width: 'calc(var(--grid-col)*2 + var(--grid-gap))',
                      height: '62px',
                    }}
                  >
                    <div className="flex h-full flex-col justify-between">
                      {/* 第一行：计时 + 暂停按钮 */}
                      <div className="flex items-center justify-between">
                        <span className="text-type-card-number text-muted-foreground tabular-nums leading-[var(--type-card-number-lh)]">
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
                    <span className="min-w-0 flex-1 truncate text-type-body text-muted-foreground leading-[var(--type-body-lh)]">
                      {t('taskNames.' + task.id, { defaultValue: task.title })}
                    </span>
                    {taskPaused ? (
                      <span className="text-type-caption text-warning leading-[var(--type-caption-lh)]">
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
            </motion.div>
          </AnimatePresence>
        </div>
        {/* 多页时显示分页器（底部 32px，与左卡底边对齐）；单页不渲染，避免与上方状态指示重复 */}
        {totalCardPages > 1 && (
          <div className="flex justify-center shrink-0" style={{ height: '32px' }}>
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                {Array.from({ length: totalCardPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      isActive={page === activePage + 1}
                      onClick={() => setActivePage(page - 1)}
                      size="icon-xs"
                      className="rounded-md"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
      )}
    </div>
  );
}