import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LayoutPanelTop, BicepsFlexed, FileChartColumn } from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WindowControls } from '@/components/WindowControls';
import { Dashboard } from '@/components/Dashboard';
import { Settings } from '@/components/Settings';
import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { StatsDashboard } from '@/components/StatsDashboard';
import { ExercisePanel } from '@/components/ExercisePanel';
import { GridDebug } from '@/components/GridDebug';
import { Toaster } from '@/components/ui/sonner';

import { useHealthStore } from '@/store';
import { syncTasks, emitPauseStateUpdated } from '@/services';

import { useAppInit } from '@/hooks/useAppInit';
import { useCountdownSync } from '@/hooks/useCountdownSync';
import { useWorkMinutesTracker } from '@/hooks/useWorkMinutesTracker';
import { useDailyStatsAutoSave } from '@/hooks/useDailyStatsAutoSave';
import { useLockScreenEvents } from '@/hooks/useLockScreenEvents';
import { useIdleDetection } from '@/hooks/useIdleDetection';
import { useSystemLockEvents } from '@/hooks/useSystemLockEvents';
import { useTrayMenuEvents } from '@/hooks/useTrayMenuEvents';
import { usePauseStateSync } from '@/hooks/usePauseStateSync';
import { useSettingsSync } from '@/hooks/useSettingsSync';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';

type ViewMode = 'main' | 'exercise' | 'stats';

export default function App() {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const tasks = useHealthStore((s) => s.tasks);
  const exercisePanel = useHealthStore((s) => s.exercisePanel);
  const isPaused = useHealthStore((s) => s.isPaused);
  const setPaused = useHealthStore((s) => s.setPaused);

  // 基础设施 hooks（修改 UI 时不得删除）
  useAppInit();
  useCountdownSync();
  useWorkMinutesTracker();
  useDailyStatsAutoSave();
  useLockScreenEvents();
  useIdleDetection();
  useSystemLockEvents();
  useTrayMenuEvents();
  usePauseStateSync();
  useSettingsSync();
  useNotificationPermission();

  // 任务变更时同步到后端
  useEffect(() => {
    syncTasks(tasks);
  }, [tasks]);

  // Tab 切换方向：按 tabIndex 计算"新 view 在旧 view 的左/右"
  const tabIndex: Record<ViewMode, number> = { main: 0, exercise: 1, stats: 2 };
  const prevViewRef = useRef<ViewMode>(viewMode);
  const tabDirection =
    viewMode !== prevViewRef.current && tabIndex[viewMode] > tabIndex[prevViewRef.current] ? 1 : -1;
  useEffect(() => {
    prevViewRef.current = viewMode;
  });

  const handleTogglePause = async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    if (isPaused) {
      setPaused(false);
      await invoke('resume_timer');
      await emitPauseStateUpdated(false);
      toast.success(t('timer.resumed', { defaultValue: '已恢复' }));
    } else {
      setPaused(true);
      await invoke('pause_timer');
      await emitPauseStateUpdated(true);
      toast.success(t('timer.paused', { defaultValue: '已暂停' }));
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-muted" onContextMenu={(e) => e.preventDefault()}>
      {/* 标题栏 */}
      <header
        className="relative flex h-[var(--titlebar-height)] shrink-0 items-center justify-between bg-muted px-2"
        data-tauri-drag-region
      >
        <Tabs
          value={settingsOpen ? '' : viewMode}
          onValueChange={(v) => {
            setSettingsOpen(false);
            setViewMode(v as ViewMode);
          }}
        >
          <TabsList className="rounded-lg bg-tab-bg p-[3px]">
            <TabsTrigger
              value="main"
              className="h-6 gap-1.5 rounded-md px-1.5 text-sm data-[selected]:bg-tab-active-bg data-[selected]:text-foreground data-[selected]:shadow-none"
            >
              <LayoutPanelTop size={16} strokeWidth={1.5} />
              <span>{t('tabs.dashboard', { defaultValue: '看板' })}</span>
            </TabsTrigger>
            <TabsTrigger
              value="exercise"
              className="h-6 gap-1.5 rounded-md px-1.5 text-sm data-[selected]:bg-tab-active-bg data-[selected]:text-foreground data-[selected]:shadow-none"
            >
              <BicepsFlexed size={16} strokeWidth={1.5} />
              <span>{t('tabs.exercise', { defaultValue: '锻炼' })}</span>
            </TabsTrigger>
            <TabsTrigger
              value="stats"
              className="h-6 gap-1.5 rounded-md px-1.5 text-sm data-[selected]:bg-tab-active-bg data-[selected]:text-foreground data-[selected]:shadow-none"
            >
              <FileChartColumn size={16} strokeWidth={1.5} />
              <span>{t('tabs.stats', { defaultValue: '统计' })}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* dev 标识 */}
        <div className="absolute left-1/2 -translate-x-1/2 flex h-5 items-center rounded bg-amber-500/20 px-2 ring-1 ring-amber-500/30">
          <span className="text-[10px] font-bold tracking-widest text-amber-400">DEV</span>
        </div>

        <WindowControls
          settingsOpen={settingsOpen}
          onOpenSettings={(initialTab) => {
            if (initialTab === undefined) {
              setSettingsOpen((prev) => !prev);
              return;
            }
            setSettingsOpen(true);
          }}
        />
      </header>

      {/* 内容区 */}
      <main className="relative flex-1 overflow-y-auto px-2 pb-2">
        {/* 页面级 6 列网格调试覆盖线（z-50），相对于 main 的 var(--grid-offset) = 24px = 窗口边缘 24px */}
        <GridDebug />
        <MotionConfig reducedMotion="user">
          <div
            className={
              `mx-auto flex h-full min-h-0 w-full max-w-[calc(var(--grid-content)+32px)] flex-col overflow-x-hidden rounded-[14px] bg-card ` +
              (settingsOpen ? '' : 'p-4')
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              {settingsOpen ? (
                <motion.div
                  key="settings"
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.96, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                  className="h-full"
                >
                  <Settings initialTab="reminders" />
                </motion.div>
              ) : (
                <motion.div
                  key={viewMode}
                  custom={tabDirection}
                  variants={{
                    initial: (dir: number) => ({ x: dir * 24, opacity: 0 }),
                    animate: { x: 0, opacity: 1 },
                    exit: (dir: number) => ({ x: -dir * 24, opacity: 0 }),
                  }}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="h-full"
                >
                  {viewMode === 'main' && <Dashboard />}
                  {viewMode === 'exercise' && <ExerciseLibrary />}
                  {viewMode === 'stats' && <StatsDashboard />}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </MotionConfig>
      </main>

      {/* ESC 关闭设置 */}
      <SettingsEscListener open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {exercisePanel.active && <ExercisePanel />}
      <Toaster />
    </div>
  );
}

function SettingsEscListener({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return null;
}