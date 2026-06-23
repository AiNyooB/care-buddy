import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LayoutPanelTop, BicepsFlexed, FileChartColumn } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import { WindowControls } from '@/components/WindowControls';
import { Dashboard } from '@/components/Dashboard';
import { Settings } from '@/components/Settings';
import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { StatsDashboard } from '@/components/StatsDashboard';
import { ExercisePanel } from '@/components/ExercisePanel';
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
  const [settingsInitialTab, setSettingsInitialTab] = useState<string>('reminders');

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
        className="flex h-[var(--titlebar-height)] shrink-0 items-center justify-between bg-muted px-2"
        data-tauri-drag-region
      >
        <Tabs
          value={viewMode}
          onValueChange={(v) => setViewMode(v as ViewMode)}
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

        <WindowControls onOpenSettings={(initialTab) => {
          if (initialTab) setSettingsInitialTab(initialTab);
          setSettingsOpen(true);
        }} />
      </header>

      {/* 内容区 */}
      <main className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="mx-auto w-full max-w-[calc(var(--grid-content)+32px)] rounded-[14px] bg-card p-4">
          {viewMode === 'main' && <Dashboard />}
          {viewMode === 'exercise' && <ExerciseLibrary />}
          {viewMode === 'stats' && <StatsDashboard />}
        </div>
      </main>

      {/* 设置 Sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="top">
          <SheetHeader showCloseButton>
            {t('settings.title')}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <Settings key={settingsInitialTab} initialTab={settingsInitialTab} />
          </div>
        </SheetContent>
      </Sheet>

      {exercisePanel.active && <ExercisePanel />}
      <Toaster />
    </div>
  );
}