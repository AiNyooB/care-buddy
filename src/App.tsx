import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutPanelTop, BicepsFlexed, BarChart3 } from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WindowControls } from '@/components/WindowControls';
import { Toaster } from '@/components/ui/sonner';

const Dashboard = React.lazy(() => import('@/components/Dashboard').then(m => ({ default: m.Dashboard })));
const Settings = React.lazy(() => import('@/components/Settings').then(m => ({ default: m.Settings })));
const ExerciseLibrary = React.lazy(() => import('@/components/ExerciseLibrary').then(m => ({ default: m.ExerciseLibrary })));
const ExercisePanel = React.lazy(() => import('@/components/ExercisePanel').then(m => ({ default: m.ExercisePanel })));

import { useHealthStore } from '@/store';
import { syncTasks } from '@/services';

import { useAppInit } from '@/hooks/useAppInit';
import { useCountdownSync } from '@/hooks/useCountdownSync';
import { useTriggerHealing } from '@/hooks/useTriggerHealing';
import { useFloatingManager } from '@/hooks/useFloatingManager';
import { useEntertainmentManager } from '@/hooks/useEntertainmentManager';
import { useModeTransition } from '@/hooks/useModeTransition';
import { useAppModeSync } from '@/hooks/useAppModeSync';
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


  // 基础设施 hooks（修改 UI 时不得删除）
  useAppInit();
  useCountdownSync();
  useTriggerHealing();
  useFloatingManager();
  useEntertainmentManager();
  useModeTransition();
  useAppModeSync();
  useWorkMinutesTracker();
  useDailyStatsAutoSave();
  useLockScreenEvents();
  useIdleDetection();
  useSystemLockEvents();
  useTrayMenuEvents();
  usePauseStateSync();
  useSettingsSync();
  useNotificationPermission();

  // 网格调试背景切换（Ctrl+G）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        document.body.classList.toggle('grid-debug');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 任务变更时同步到后端
  const syncLock = useRef(false);
  useEffect(() => {
    if (syncLock.current) return;
    syncLock.current = true;
    syncTasks(tasks).finally(() => { syncLock.current = false; });
  }, [tasks]);

  // Tab 切换方向：按 tabIndex 计算"新 view 在旧 view 的左/右"
  const tabIndex: Record<ViewMode, number> = { main: 0, exercise: 1, stats: 2 };
  const prevViewRef = useRef<ViewMode>(viewMode);
  const tabDirection =
    viewMode !== prevViewRef.current && tabIndex[viewMode] > tabIndex[prevViewRef.current] ? 1 : -1;
  useEffect(() => {
    prevViewRef.current = viewMode;
  });

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
              <span>{t('tabs.exercise', { defaultValue: '活动' })}</span>
            </TabsTrigger>
            <TabsTrigger
              value="stats"
              disabled
              hidden
              className="h-6 gap-1.5 rounded-md px-1.5 text-sm data-[selected]:bg-tab-active-bg data-[selected]:text-foreground data-[selected]:shadow-none"
            >
              <BarChart3 size={16} strokeWidth={1.5} />
              <span>{t('tabs.stats', { defaultValue: '统计' })}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {import.meta.env.VITE_DEV_BADGE === 'true' && (
          <div className="absolute left-1/2 -translate-x-1/2 flex h-5 items-center rounded bg-amber-500/20 px-2 ring-1 ring-amber-500/30">
            <span className="text-[10px] font-bold tracking-widest text-amber-400">DEV</span>
          </div>
        )}

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
        <MotionConfig reducedMotion="user">
          <div
            className={
              `mx-auto flex h-full min-h-0 w-full max-w-[calc(var(--grid-content)+32px)] flex-col overflow-x-hidden rounded-[14px] bg-card ` +
              (settingsOpen ? '' : 'p-4')
            }
          >
            <Suspense fallback={null}>
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
                </motion.div>
              )}
            </AnimatePresence>
            </Suspense>
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

