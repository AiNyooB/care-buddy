import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import { pauseTimer, resumeTimer, timerResetAll, timerPauseTask, timerResumeTask, timerResetTask, updatePauseMenu, emitPauseStateUpdated } from '../services';
import { cn } from '@/lib/utils';

export function TimerCards() {
  const { t } = useTranslation();
  const tasks = useHealthStore((s) => s.tasks);
  const taskStates = useHealthStore((s) => s.taskStates);
  const isPaused = useHealthStore((s) => s.isPaused);
  const setPaused = useHealthStore((s) => s.setPaused);
  const pauseTask = useHealthStore((s) => s.pauseTask);
  const resumeTask = useHealthStore((s) => s.resumeTask);
  const resetTask = useHealthStore((s) => s.resetTask);
  const resetAllTasks = useHealthStore((s) => s.resetAllTasks);

  const [currentPage, setCurrentPage] = useState(1);
  const cardsPerPage = 3;

  const enabledTasks = tasks.filter((t) => t.enabled);
  const somePaused = enabledTasks.some((t) => taskStates[t.id]?.paused);

  const totalPages = Math.ceil(enabledTasks.length / cardsPerPage);
  const startIndex = (currentPage - 1) * cardsPerPage;
  const endIndex = startIndex + cardsPerPage;
  const currentTasks = enabledTasks.slice(startIndex, endIndex);

  const handlePageChange = () => {
    if (totalPages > 1) {
      setCurrentPage((prev) => (prev % totalPages) + 1);
    }
  };

  const handleTogglePause = async () => {
    const newPaused = !isPaused;
    try {
      if (newPaused) {
        await pauseTimer();
      } else {
        await resumeTimer();
      }
      setPaused(newPaused);
      await updatePauseMenu(newPaused).catch(console.warn);
      await emitPauseStateUpdated(newPaused).catch(console.warn);
    } catch (e) {
      console.warn('toggle pause failed:', e);
    }
  };

  const handleResetAll = async () => {
    resetAllTasks();
    await timerResetAll().catch(console.warn);
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (enabledTasks.length === 0) {
    return (
      <div className="flex w-full items-center justify-center bg-card">
        <span className="text-sm text-muted-foreground">{t('timerCarousel.empty')}</span>
      </div>
    );
  }

  return (
    <div className="flex w-full shrink-0 flex-col gap-3">
      {/* ====== Zone 1: Status & Title Bar ====== */}
      <div className="flex h-[50px] items-end justify-between gap-3">
        {/* 左侧：标题 + 状态 */}
        <div className="flex flex-col justify-center items-start">
          <span className="text-type-page-title font-bold text-foreground">
            {t('timerCarousel.title', { defaultValue: '我的提醒' })}
          </span>
          <div className="flex items-center gap-1">
            <div className="size-2 rounded-full" style={{ backgroundColor: '#22C45E' }} />
            <span className="text-type-caption text-muted-foreground">
              {isPaused
                ? t('timerCarousel.allPaused')
                : somePaused
                  ? t('timerCarousel.somePaused')
                  : t('timerCarousel.statusNormal')}
            </span>
          </div>
        </div>
        {/* 右侧：分页器 + 按钮组 */}
        <div className="flex items-center gap-3">
          {/* 分页器 */}
          {totalPages > 1 && (
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      isActive={page === currentPage}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
              </PaginationContent>
            </Pagination>
          )}
          
          {/* 全局按钮组 - 使用 ButtonGroup 组件 */}
          <ButtonGroup>
            <Button
              variant="outline"
              size="default"
              className="w-20"
              onClick={handleTogglePause}
            >
              {isPaused ? t('timerCarousel.resumeAll') : t('timerCarousel.pauseAll')}
            </Button>
            <Button
              variant="outline"
              size="default"
              className="w-20"
              onClick={handleResetAll}
            >
              {t('timerCarousel.resetAll')}
            </Button>
          </ButtonGroup>
        </div>
      </div>

      {/* ====== Zone 2: Timer Cards ====== */}
      <div className="flex items-center justify-center gap-3 pb-4">
        {currentTasks.map((task) => {
          const tsk = taskStates[task.id];
          const remaining = tsk?.countdown ?? task.interval * 60;
          const taskProg = (task.interval * 60 - remaining) / (task.interval * 60);
          const paused = tsk?.paused ?? false;
          const isTaskPaused = paused || isPaused;
          const remainingPercent = Math.round((1 - taskProg) * 100);

          return (
            <div
              key={task.id}
              className={cn(
                'group relative flex h-[208px] w-[var(--card-width)] flex-col items-center justify-between rounded-[18px] border border-border bg-card p-3 transition-all',
                isTaskPaused && 'opacity-60 grayscale-[0.3]'
              )}
            >
              {/* 顶部：倒计时 */}
              <div className="flex flex-col items-center gap-1 pt-0">
                <span className="text-type-timer-number font-bold text-foreground tabular-nums">
                  {formatCountdown(remaining)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('timerCarousel.remainingPercent', { percent: remainingPercent })}
                </span>
              </div>

              {/* 底部：任务名称 + 操作按钮 */}
              <div className="flex w-full flex-col items-center gap-4">
                {/* 任务名称 */}
                <div className="flex flex-col items-center gap-1">
                  <span className="w-full min-w-0 truncate text-center text-sm font-medium text-foreground">
                    {t('taskNames.' + task.id, { defaultValue: task.title })}
                  </span>
                  {isTaskPaused && (
                    <span className="text-[10px] text-muted-foreground">
                      {t('timerCarousel.paused', { defaultValue: '已暂停' })}
                    </span>
                  )}
                </div>

                {/* 操作按钮（hover 显示） */}
                <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7 rounded-lg"
                    disabled={isPaused}
                    onClick={() => {
                      if (paused) {
                        resumeTask(task.id);
                        timerResumeTask(task.id).catch(console.warn);
                      } else {
                        pauseTask(task.id);
                        timerPauseTask(task.id).catch(console.warn);
                      }
                    }}
                  >
                    {isPaused ? <Play size={14} /> : paused ? <Play size={14} /> : <Pause size={14} />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7 rounded-lg"
                    onClick={() => {
                      resetTask(task.id);
                      timerResetTask(task.id).catch(console.warn);
                    }}
                  >
                    <RotateCcw size={14} />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}