import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import { CircularProgress } from './CircularProgress';
import { pauseTimer, resumeTimer, timerResetAll, timerPauseTask, timerResumeTask, timerResetTask, updatePauseMenu, emitPauseStateUpdated } from '../services';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import { cn } from '@/lib/utils';

const AUTO_PLAY_INTERVAL = 5000;
const AUTO_RESUME_DELAY = 15;

export function TimerCarousel() {
  const { t } = useTranslation();
  const tasks = useHealthStore((s) => s.tasks);
  const taskStates = useHealthStore((s) => s.taskStates);
  const isPaused = useHealthStore((s) => s.isPaused);
  const setPaused = useHealthStore((s) => s.setPaused);
  const pauseTask = useHealthStore((s) => s.pauseTask);
  const resumeTask = useHealthStore((s) => s.resumeTask);
  const resetTask = useHealthStore((s) => s.resetTask);
  const resetAllTasks = useHealthStore((s) => s.resetAllTasks);

  const enabledTasks = tasks.filter((t) => t.enabled);
  const somePaused = enabledTasks.some((t) => taskStates[t.id]?.paused);

  const [api, setApi] = useState<CarouselApi | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autoResumeCountdown, setAutoResumeCountdown] = useState<number | null>(null);
  const [autoplayPlugin] = useState(() => Autoplay({ delay: AUTO_PLAY_INTERVAL, stopOnInteraction: false }));

  const onSelect = useCallback(() => {
    if (!api) return;
    setSelectedIndex(api.selectedScrollSnap());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    api.on('select', onSelect);
    onSelect();
    return () => {
      api.off('select', onSelect);
    };
  }, [api, onSelect]);

  // Auto-resume countdown: counts down from 15, then resumes autoplay
  useEffect(() => {
    if (autoResumeCountdown === null) return;

    if (autoResumeCountdown <= 0) {
      autoplayPlugin.play();
      setAutoResumeCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setAutoResumeCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoResumeCountdown, autoplayPlugin]);

  const handleToggleClick = (index: number) => {
    api?.scrollTo(index);
    autoplayPlugin.stop();
    setAutoResumeCountdown(AUTO_RESUME_DELAY);
  };

  const handleTogglePause = async () => {
    const newPaused = !isPaused;
    // Bug N8: 先 await 后端成功再更新前端，避免前后端状态不一致
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
      <div className="flex w-[520px] items-center justify-center bg-card">
        <span className="text-sm text-muted-foreground">{t('timerCarousel.empty')}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-[520px] shrink-0 flex-col items-center gap-4">
      {/* ====== Zone 1: Status & Title Bar ====== */}
      <div className="flex items-center justify-between w-full h-10 min-h-10 px-2">
        {/* 左侧：状态提示 */}
        <div className="flex items-center gap-2">
          {autoResumeCountdown !== null && autoResumeCountdown > 0 ? (
            <div className="flex items-center gap-2 animate-in fade-in duration-300">
              <div className="w-16 h-0.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000"
                  style={{ width: `${(autoResumeCountdown / AUTO_RESUME_DELAY) * 100}%` }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {autoResumeCountdown}s {t('timerCarousel.autoResume')}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 animate-in fade-in duration-300">
              {/* 状态指示点 */}
              <span
                className={cn(
                  'inline-block w-2 h-2 rounded-full transition-colors duration-300',
                  isPaused
                      ? 'bg-muted-foreground'
                    : somePaused
                      ? 'bg-warning'
                      : 'bg-primary',
                  !isPaused && 'animate-pulse'
                )}
              />
              {/* 状态文字 */}
              <span className="text-xs text-muted-foreground">
                {isPaused
                  ? t('timerCarousel.allPaused')
                  : somePaused
                    ? t('timerCarousel.somePaused')
                    : t('timerCarousel.statusNormal')}
              </span>
              <span className="text-xs text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground/60">
                {enabledTasks.length} 个提醒
              </span>
            </div>
          )}
        </div>
        {/* 右侧：全局操作 */}
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="size-7 rounded-lg" onClick={handleTogglePause}>
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7 rounded-lg" onClick={handleResetAll}>
            <RotateCcw size={14} />
          </Button>
        </div>
      </div>

      {/* ====== Zone 2: Carousel ====== */}
      <div className="flex flex-1 items-center">
        <Carousel opts={{ loop: true }} plugins={[autoplayPlugin]} setApi={setApi}>
          <CarouselContent className="w-[360px] pb-5 pt-4">
            {enabledTasks.map((task) => {
              const tsk = taskStates[task.id];
              const remaining = tsk?.countdown ?? task.interval * 60;
              const taskProg = (task.interval * 60 - remaining) / (task.interval * 60);
              const paused = tsk?.paused ?? false;
              const isTaskPaused = paused || isPaused;
              const remainingPercent = Math.round((1 - taskProg) * 100);

              return (
                <CarouselItem key={task.id}>
                  <div
                    className={`relative mx-auto flex h-[430px] w-[340px] flex-col rounded-[18px] border-2 border-border bg-card p-8 shadow-lg transition-all duration-300 animate-in fade-in duration-300 ${
                      isTaskPaused ? 'opacity-60 grayscale-[0.3]' : ''
                    }`}
                  >
                    {/* Top: 任务名称 + 辅助说明 */}
                    <div className="flex-none flex flex-col items-center gap-1">
                      <span className="text-lg font-semibold text-foreground">
                        {t('taskNames.' + task.id, { defaultValue: task.title })}
                      </span>
                      <span className="text-xs text-muted-foreground/70">
                        {t('tasks.' + task.id + '.desc', { defaultValue: '' })}
                      </span>
                    </div>

                    {/* Middle: 圆环 + 倒计时 — flex-1 居中 */}
                    <div className="flex-1 flex items-center justify-center">
                      <CircularProgress size={170} strokeWidth={6} progress={taskProg}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="font-sans text-[32px] font-bold leading-[39px] text-foreground">
                            {formatCountdown(remaining)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            剩余 {remainingPercent}%
                          </span>
                        </div>
                      </CircularProgress>
                    </div>

                    {/* Bottom: 分隔线 + 操作按钮 */}
                    <div className="flex-none flex flex-col items-center gap-5">
                      <div className="w-full mx-8 border-t border-border/50 animate-in slide-in-from-left-4 duration-500" />
                      <div className="flex gap-5">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-12 rounded-lg border-2"
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
                          {isPaused ? <Play size={18} /> : paused ? <Play size={18} /> : <Pause size={18} />}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-12 rounded-lg border-2"
                          onClick={() => {
                            resetTask(task.id);
                            timerResetTask(task.id).catch(console.warn);
                          }}
                        >
                          <RotateCcw size={18} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
      </div>

      {/* ====== Zone 3: Toggle ====== */}
      <div className="flex flex-wrap justify-center gap-2.5">
        {enabledTasks.map((task, i) => (
          <Toggle
            key={task.id}
            pressed={selectedIndex === i}
            onPressedChange={() => handleToggleClick(i)}
            className={cn(
              'w-auto min-w-[80px] px-3 h-8 text-sm',
              taskStates[task.id]?.paused && 'line-through decoration-muted-foreground/50'
            )}
          >
            {t('taskNames.' + task.id, { defaultValue: task.title })}
          </Toggle>
        ))}
      </div>
    </div>
  );
}
