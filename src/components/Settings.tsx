import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { toast } from 'sonner';
import { setAutoStart, saveSettingsToBackend, emitSettingsUpdated, syncTasks, setIdleThreshold, updateTrayLanguage } from '../services';
import { Shield, Sun, Moon, Monitor, Globe, Clock, Timer, GlassWater, Eye, Plus, X, Trash2, ChevronRight, Bell } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from '@/components/ui/collapsible';
import type { Task, TaskIcon, ScheduleType } from '../types';

const LOCALES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en-US', name: 'English' },
];

const DEFAULT_TASK_IDS = new Set(['sit', 'water', 'eye']);
const MAX_TASKS = 12; // 4 页 × 3 个/页

function TaskIcon({ icon, size = 14 }: { icon: string; size?: number }) {
  switch (icon) {
    case 'eye': return <Eye size={size} />;
    case 'water': return <GlassWater size={size} />;
    default: return <Clock size={size} />;
  }
}

function timeDiffInMinutes(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

interface MergeWarningProps {
  current: Task;
  all: Task[];
  threshold: number;
}

function MergeWarning({ current, all, threshold }: MergeWarningProps) {
  const similarTasks = all.filter((other) => {
    if (other.id === current.id) return false;
    if (other.scheduleType !== current.scheduleType) return false;

    if (current.scheduleType === 'interval') {
      return Math.abs(other.interval - current.interval) <= threshold;
    }

    if (current.scheduleType === 'daily' && current.dailyTimes.length > 0 && other.dailyTimes.length > 0) {
      return current.dailyTimes.some((t) =>
        other.dailyTimes.some((ot) => timeDiffInMinutes(t, ot) <= threshold)
      );
    }

    return false;
  });

  if (similarTasks.length === 0) return null;

  const names = similarTasks.map((t) => t.title).join('、');
  return (
    <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <Bell size={12} className="mt-0.5 shrink-0" />
      <span>与 {names} 间隔接近，开启锁屏后会合并触发</span>
    </div>
  );
}

// ============================================================================
// 我的提醒 Tab
// ============================================================================

export function RemindersSection() {
  const { t } = useTranslation();
  const settings = useHealthStore((s) => s.settings);
  const tasks = useHealthStore((s) => s.tasks);
  const updateTask = useHealthStore((s) => s.updateTask);
  const toggleTask = useHealthStore((s) => s.toggleTask);
  const removeTask = useHealthStore((s) => s.removeTask);
  const addTask = useHealthStore((s) => s.addTask);

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskIcon, setNewTaskIcon] = useState<TaskIcon>('sit');

  // 提醒数量达到上限时通知用户
  const atLimit = tasks.length >= MAX_TASKS;
  const notified = useRef(false);
  useEffect(() => {
    if (atLimit && !notified.current) {
      notified.current = true;
      toast.info(t('settings.taskLimitReached', { defaultValue: `最多支持 ${MAX_TASKS} 个提醒，已达上限` }));
    }
  }, [atLimit, t]);

  const makeInputKey = (taskId: string, field: string) => `${taskId}-${field}`;

  const handleNumBlur = (taskId: string, key: string, min: number, max: number, fallback: number, field: keyof Task) => {
    const raw = inputValues[key];
    if (raw === undefined) return;
    const num = Math.max(min, Math.min(max, parseInt(raw, 10) || fallback));
    updateTask(taskId, { [field]: num } as Partial<Task>);
    setInputValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    syncTasks(useHealthStore.getState().tasks);
  };

  const numField = (
    taskId: string,
    field: keyof Task,
    value: number,
    min: number,
    max: number,
    fallback: number,
    suffix: string,
    step?: number,
  ) => {
    const key = makeInputKey(taskId, String(field));
    const displayValue = key in inputValues ? inputValues[key] : String(value);
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={displayValue}
          onChange={(e) => setInputValues((prev) => ({ ...prev, [key]: e.target.value }))}
          onFocus={() => {
            if (!(key in inputValues)) {
              setInputValues((prev) => ({ ...prev, [key]: String(value) }));
            }
          }}
          onBlur={() => handleNumBlur(taskId, key, min, max, fallback, field)}
          className="h-7 w-14 text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
    );
  };

  const handleAddTime = (taskId: string) => {
    const task = useHealthStore.getState().tasks.find((t) => t.id === taskId);
    if (!task) return;
    updateTask(taskId, { dailyTimes: [...task.dailyTimes, '09:00'] });
    syncTasks(useHealthStore.getState().tasks);
  };

  const handleRemoveTime = (taskId: string, index: number) => {
    const task = useHealthStore.getState().tasks.find((t) => t.id === taskId);
    if (!task) return;
    updateTask(taskId, { dailyTimes: task.dailyTimes.filter((_, i) => i !== index) });
    syncTasks(useHealthStore.getState().tasks);
  };

  const handleTimeChange = (taskId: string, index: number, value: string) => {
    const task = useHealthStore.getState().tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newTimes = [...task.dailyTimes];
    newTimes[index] = value;
    updateTask(taskId, { dailyTimes: newTimes });
    syncTasks(useHealthStore.getState().tasks);
  };

  const handleScheduleTypeChange = (taskId: string, value: ScheduleType) => {
    updateTask(taskId, {
      scheduleType: value,
      dailyTimes: value === 'interval' ? [] : ['09:00'],
    });
    syncTasks(useHealthStore.getState().tasks);
  };

  const handleToggle = (taskId: string) => {
    toggleTask(taskId);
    syncTasks(useHealthStore.getState().tasks);
  };

  const handleDeleteTask = (taskId: string) => {
    removeTask(taskId);
    syncTasks(useHealthStore.getState().tasks);
  };

  const handleAddTask = () => {
    const newTask: Task = {
      id: `custom-${Date.now()}`,
      title: newTaskName,
      desc: `${newTaskName}提醒`,
      interval: 45,
      enabled: true,
      icon: newTaskIcon,
      lockDuration: 60,
      autoResetOnIdle: false,
      preNotificationSeconds: 10,
      snoozeMinutes: 5,
      scheduleType: 'interval',
      dailyTimes: [],
    };
    addTask(newTask);
    syncTasks(useHealthStore.getState().tasks);
    setShowAddForm(false);
    setNewTaskName('');
    setNewTaskIcon('sit');
  };

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {tasks.map((task) => {
          const isDefault = DEFAULT_TASK_IDS.has(task.id);
          return (
            <Card key={task.id} className="border border-border ring-0">
              <Collapsible defaultOpen={false}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <CollapsibleTrigger render={<div />} className="flex items-center gap-2 min-w-0 flex-1">
                      <ChevronRight size={14} className="-ml-0.5 shrink-0 transition-transform data-open:rotate-90" />
                      <TaskIcon icon={task.icon} />
                      <span className="text-sm font-medium text-foreground truncate">{task.title}</span>
                      {isDefault && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
                          默认
                        </Badge>
                      )}
                    </CollapsibleTrigger>
                    <Switch
                      checked={task.enabled}
                      onCheckedChange={(_, details) => { details.event.stopPropagation(); handleToggle(task.id); }}
                    />
                  </div>
                </CardContent>

                <CollapsiblePanel keepMounted>
                  <CardContent className="p-3 pt-0 space-y-2 border-t border-border">
                    {!isDefault && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground w-12 shrink-0">调度方式</Label>
                        <Select
                          value={task.scheduleType}
                          onValueChange={(v) => handleScheduleTypeChange(task.id, v as ScheduleType)}
                        >
                          <SelectTrigger className="h-7 w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="interval">间隔</SelectItem>
                            <SelectItem value="daily">固定时间</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {task.scheduleType === 'interval' ? (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground w-12 shrink-0">间隔</Label>
                        {numField(task.id, 'interval', task.interval, 5, 180, 5, t('time.minutes'), 5)}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground w-12">时间</Label>
                        {task.dailyTimes.map((time, i) => (
                          <div key={i} className="flex items-center gap-1 ml-12">
                            <Input
                              type="time"
                              value={time}
                              onChange={(e) => handleTimeChange(task.id, i, e.target.value)}
                              className="h-7 w-20 text-xs"
                            />
                            <button
                              onClick={() => handleRemoveTime(task.id, i)}
                              className="flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddTime(task.id)}
                          className="h-6 text-xs ml-12 text-muted-foreground hover:text-foreground"
                        >
                          <Plus size={12} /> 添加时间
                        </Button>
                      </div>
                    )}

                    {settings.lockScreenEnabled && (
                      <MergeWarning current={task} all={tasks} threshold={settings.mergeThreshold} />
                    )}

                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground w-12 shrink-0">预告</Label>
                      {numField(task.id, 'preNotificationSeconds', task.preNotificationSeconds, 0, 120, 0, '秒', 5)}
                    </div>

                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground w-12 shrink-0">锁屏时长</Label>
                      {numField(task.id, 'lockDuration', task.lockDuration, 10, 600, 60, '秒', 10)}
                    </div>

                    {!isDefault && (
                      <div className="pt-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteTask(task.id)}
                          className="h-7 text-xs"
                        >
                          <Trash2 size={12} /> 删除提醒
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </CollapsiblePanel>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {!atLimit && (
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm((v) => !v)}
            className="w-full h-8 text-xs"
          >
            <Plus size={14} /> 添加自定义提醒
          </Button>
        </div>
      )}

      {showAddForm && (
        <div className="rounded-lg border border-border ring-0 p-3 space-y-2 bg-muted/30">
          <h4 className="text-xs font-medium text-foreground">新提醒</h4>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-12 shrink-0">名称</Label>
            <Input
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              className="h-7 text-xs flex-1"
              placeholder="提醒名称"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-12 shrink-0">图标</Label>
            <div className="flex gap-1">
              {(['sit', 'water', 'eye'] as TaskIcon[]).map((icon) => (
                <button
                  key={icon}
                  onClick={() => setNewTaskIcon(icon)}
                  className={`flex size-7 items-center justify-center rounded ${
                    newTaskIcon === icon
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-muted/80'
                  } transition-colors`}
                >
                  <TaskIcon icon={icon} size={14} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)} className="h-7 text-xs">
              取消
            </Button>
            <Button size="sm" onClick={handleAddTask} disabled={!newTaskName.trim()} className="h-7 text-xs">
              添加
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 通用设置 Tab
// ============================================================================

export function GeneralSection() {
  const { t, i18n } = useTranslation();
  const settings = useHealthStore((s) => s.settings);
  const updateSettings = useHealthStore((s) => s.updateSettings);
  const updateTask = useHealthStore((s) => s.updateTask);

  const [idleInputValue, setIdleInputValue] = useState(String(settings.idleThreshold));

  const ThemeIcon = settings.theme === 'dark' ? Moon : settings.theme === 'light' ? Sun : Monitor;

  const handleThemeSelect = async (value: 'light' | 'dark' | 'system') => {
    updateSettings({ theme: value });

    document.documentElement.setAttribute('data-theme', value === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : value
    );

    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, theme: value }).catch(console.error);
    await emitSettingsUpdated({ theme: value }).catch(console.error);
  };

  const handleAutoStartToggle = async (checked: boolean) => {
    updateSettings({ autoStart: checked });
    try {
      await setAutoStart(checked);
    } catch (e) {
      console.warn('AutoStart toggle failed:', e);
    }
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, autoStart: checked }).catch(console.error);
    await emitSettingsUpdated({ autoStart: checked }).catch(console.error);
  };

  const handleAutoUnlockToggle = async (checked: boolean) => {
    updateSettings({ autoUnlock: checked });
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, autoUnlock: checked }).catch(console.error);
    await emitSettingsUpdated({ autoUnlock: checked }).catch(console.error);
  };

  const handleResetOnIdleToggle = async (checked: boolean) => {
    updateSettings({ autoResetOnIdle: checked });
    const currentTasks = useHealthStore.getState().tasks;
    currentTasks.forEach((t) => updateTask(t.id, { autoResetOnIdle: checked }));
    syncTasks(currentTasks.map((t) => ({ ...t, autoResetOnIdle: checked })));
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, autoResetOnIdle: checked }).catch(console.error);
    await emitSettingsUpdated({ autoResetOnIdle: checked }).catch(console.error);
  };

  const handleIdleThresholdChange = async (value: number) => {
    const clamped = Math.max(1, Math.min(60, value));
    updateSettings({ idleThreshold: clamped });
    await setIdleThreshold(clamped);
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, idleThreshold: clamped }).catch(console.error);
    await emitSettingsUpdated({ idleThreshold: clamped }).catch(console.error);
  };

  return (
    <div className="space-y-1">
      {/* Language */}
      <div className="flex items-center justify-between py-2">
        <div className="flex flex-col gap-0.5">
          <Label className="flex items-center gap-1 text-sm">
            <Globe size={14} />
            {t('settings.language')}
          </Label>
          <span className="text-xs text-muted-foreground">{t('settings.languageDesc')}</span>
        </div>
        <Select
          value={i18n.language}
          onValueChange={async (value) => {
            if (!value) return;
            i18n.changeLanguage(value);
            updateSettings({ locale: value as 'zh-CN' | 'en-US' });
            const currentSettings = useHealthStore.getState().settings;
            await saveSettingsToBackend({ ...currentSettings, locale: value as 'zh-CN' | 'en-US' }).catch(console.error);
            await emitSettingsUpdated({ locale: value }).catch(console.error);
            await updateTrayLanguage(value).catch(console.error);
          }}
        >
          <SelectTrigger className="w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Theme */}
      <div className="flex items-center justify-between py-2">
        <div className="flex flex-col gap-0.5">
          <Label className="flex items-center gap-1 text-sm">
            <ThemeIcon size={14} />
            {t('settings.theme')}
          </Label>
          <span className="text-xs text-muted-foreground">{t('settings.themeDesc')}</span>
        </div>
        <Select
          value={settings.theme}
          onValueChange={(value) => handleThemeSelect(value as 'light' | 'dark' | 'system')}
        >
          <SelectTrigger className="w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">
              <span className="flex items-center gap-1.5"><Sun size={12} />{t('settings.light')}</span>
            </SelectItem>
            <SelectItem value="dark">
              <span className="flex items-center gap-1.5"><Moon size={12} />{t('settings.dark')}</span>
            </SelectItem>
            <SelectItem value="system">
              <span className="flex items-center gap-1.5"><Monitor size={12} />{t('settings.system')}</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator className="my-2" />

      {/* Auto Unlock */}
      <div className="flex items-center justify-between py-2">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm">{t('settings.autoUnlock')}</Label>
          <span className="text-xs text-muted-foreground">{t('settings.autoUnlockDesc')}</span>
        </div>
        <Switch checked={settings.autoUnlock} onCheckedChange={handleAutoUnlockToggle} />
      </div>

      {/* Reset on Idle */}
      <div className="flex items-center justify-between py-2">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm">{t('settings.resetOnIdle')}</Label>
          <span className="text-xs text-muted-foreground">{t('settings.resetOnIdleDesc')}</span>
        </div>
        <Switch checked={settings.autoResetOnIdle} onCheckedChange={handleResetOnIdleToggle} />
      </div>

      {/* Idle Threshold */}
      <div className="flex items-center justify-between py-2">
        <div className="flex flex-col gap-0.5">
          <Label className="flex items-center gap-1 text-sm">
            <Timer size={14} />
            {t('settings.idleThreshold')}
          </Label>
          <span className="text-xs text-muted-foreground">{t('settings.idleThresholdDesc')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={idleInputValue}
            onChange={(e) => setIdleInputValue(e.target.value)}
            onBlur={() => handleIdleThresholdChange(parseInt(idleInputValue, 10) || 5)}
            className="h-7 w-14 text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-xs text-muted-foreground">{t('time.minutes')}</span>
        </div>
      </div>

      {/* Auto Start */}
      <div className="flex items-center justify-between py-2">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm">{t('settings.autoStart')}</Label>
          <span className="text-xs text-muted-foreground">{t('settings.autoStartDesc')}</span>
        </div>
        <Switch checked={settings.autoStart} onCheckedChange={handleAutoStartToggle} />
      </div>
    </div>
  );
}

// ============================================================================
// 高级设置 Tab
// ============================================================================

export function AdvancedSection() {
  const { t } = useTranslation();
  const settings = useHealthStore((s) => s.settings);
  const updateSettings = useHealthStore((s) => s.updateSettings);

  const [mergeInputValue, setMergeInputValue] = useState(String(settings.mergeThreshold));

  const handleLockScreenToggle = async (checked: boolean) => {
    updateSettings({ lockScreenEnabled: checked });
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, lockScreenEnabled: checked }).catch(console.error);
    await emitSettingsUpdated({ lockScreenEnabled: checked }).catch(console.error);
  };

  const handleMergeThresholdChange = async (value: number) => {
    const clamped = Math.max(1, Math.min(30, value));
    updateSettings({ mergeThreshold: clamped });
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, mergeThreshold: clamped }).catch(console.error);
    await emitSettingsUpdated({ mergeThreshold: clamped }).catch(console.error);
  };

  const handleStrictModeToggle = async (checked: boolean) => {
    updateSettings({ strictMode: checked });
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, strictMode: checked }).catch(console.error);
    await emitSettingsUpdated({ strictMode: checked }).catch(console.error);
  };

  return (
    <div className="space-y-1">
      {/* Lock Screen */}
      <div className="flex items-center justify-between py-2">
        <div className="flex flex-col gap-0.5">
          <Label className="text-sm">{t('settings.lockScreen')}</Label>
          <span className="text-xs text-muted-foreground">{t('settings.lockScreenDesc')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={settings.lockScreenEnabled} onCheckedChange={handleLockScreenToggle} />
        </div>
      </div>

      {settings.lockScreenEnabled && (
        <div className="flex items-center justify-between py-2 pl-4">
          <Label className="text-xs text-muted-foreground">{t('settings.mergeThreshold')}</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              value={mergeInputValue}
              onChange={(e) => setMergeInputValue(e.target.value)}
              onBlur={() => handleMergeThresholdChange(parseInt(mergeInputValue, 10) || 5)}
              className="h-7 w-14 text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs text-muted-foreground">{t('time.minutes')}</span>
          </div>
        </div>
      )}

      {/* Strict Mode */}
      <div className="flex items-center justify-between py-2">
        <div className="flex flex-col gap-0.5">
          <Label className="flex items-center gap-1 text-sm" style={{ color: 'var(--destructive)' }}>
            <Shield size={14} />
            {t('settings.strictMode')}
          </Label>
          <span className="text-xs text-muted-foreground">{t('settings.strictModeDesc')}</span>
        </div>
        <Switch checked={settings.strictMode} onCheckedChange={handleStrictModeToggle} />
      </div>
    </div>
  );
}

// ============================================================================
// Settings wrapper with Tabs
// ============================================================================

interface SettingsProps {
  isStandalone?: boolean;
}

export function Settings({ isStandalone = false }: SettingsProps) {
  const { t } = useTranslation();

  return (
    <Tabs defaultValue="reminders" className="flex flex-col">
      <div className="sticky top-0 z-10 bg-card px-4 pt-3 pb-0">
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="reminders" className="flex-1 text-xs">
            {t('settings.myReminders')}
          </TabsTrigger>
          <TabsTrigger value="general" className="flex-1 text-xs">
            {t('settings.general')}
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex-1 text-xs">
            {t('settings.advancedSettings')}
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <TabsContent value="reminders">
          <RemindersSection />
        </TabsContent>
        <TabsContent value="general">
          <GeneralSection />
        </TabsContent>
        <TabsContent value="advanced">
          <AdvancedSection />
        </TabsContent>
      </div>
    </Tabs>
  );
}