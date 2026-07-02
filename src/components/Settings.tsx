import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { setAutoStart, saveSettingsToBackend, emitSettingsUpdated, syncTasks, setIdleThreshold, updateTrayLanguage } from '../services';
import { Shield, Sun, Moon, Monitor, Globe, Plus, X, Bell, Trash2, Timer, LockOpen, RefreshCw, Power, Lock, Dumbbell, type LucideIcon } from 'lucide-react';

import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import { NumberField } from '@base-ui/react/number-field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { TaskIcon } from './Icons';
import { exercises, categoryNames } from '../data/exercises';
import { computeExerciseDuration, formatExerciseDuration } from '../utils/exercise';
import { formatDuration } from '../utils/time';
import type { Task, ScheduleType, AppSettings } from '../types';

const LOCALES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en-US', name: 'English' },
];

const THEME_OPTIONS = [
  { value: 'light' as const, icon: Sun, labelKey: 'settings.light' },
  { value: 'dark' as const, icon: Moon, labelKey: 'settings.dark' },
  { value: 'system' as const, icon: Monitor, labelKey: 'settings.system' },
];

const DEFAULT_TASK_IDS = new Set(['sit', 'water', 'eye']);
const MAX_TASKS = 12; // 4 页 × 3 个/页

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

    if (current.scheduleType === 'daily' && current.dailyTime && other.dailyTime) {
      return timeDiffInMinutes(current.dailyTime, other.dailyTime) <= threshold;
    }

    return false;
  });

  if (similarTasks.length === 0) return null;

  const names = similarTasks.map((t) => t.title).join('、');
  return (
    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Bell size={12} className="mt-0.5 shrink-0" />
      <span>与 {names} 间隔接近，开启锁屏后会合并触发</span>
    </div>
  );
}

// ============================================================================
// 设置行 — 复用 General / Advanced / 未来其他 section
// ============================================================================

interface SettingRowProps {
  label: ReactNode;
  desc?: ReactNode;
  icon?: LucideIcon;
  destructive?: boolean;
  children: ReactNode;
}

function SettingRow({ label, desc, icon: Icon, destructive, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex flex-col gap-0.5">
        <Label
          className={cn(
            'flex items-center gap-1 text-sm',
            destructive && 'text-destructive'
          )}
        >
          {Icon && <Icon size={14} />}
          {label}
        </Label>
        {desc && <span className="text-xs text-muted-foreground">{desc}</span>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

// ============================================================================
// 提醒管理 Tab
// ============================================================================

interface EditingState {
  mode: 'new' | 'edit';
  taskId?: string;
  draft: Task;
}

function createEmptyTask(): Task {
  return {
    id: `custom-${Date.now()}`,
    title: '',
    desc: '',
    interval: 45,
    enabled: true,
    icon: 'exercise',
    lockDuration: 60,
    autoResetOnIdle: useHealthStore.getState().settings.autoResetOnIdle,
    preNotificationSeconds: 10,
    snoozeMinutes: 5,
    scheduleType: 'interval',
    dailyTime: null,
    isExerciseTask: false,
    exerciseIds: undefined,
  };
}

export function RemindersSection() {
  const { t } = useTranslation();
  const settings = useHealthStore((s) => s.settings);
  const tasks = useHealthStore((s) => s.tasks);
  const updateTask = useHealthStore((s) => s.updateTask);
  const toggleTask = useHealthStore((s) => s.toggleTask);
  const removeTask = useHealthStore((s) => s.removeTask);
  const addTask = useHealthStore((s) => s.addTask);

  const [editing, setEditing] = useState<EditingState | null>(null);

  // 提醒数量达到上限时通知用户
  const atLimit = tasks.length >= MAX_TASKS;
  const notified = useRef(false);
  useEffect(() => {
    if (atLimit && !notified.current) {
      notified.current = true;
      toast.info(t('settings.taskLimitReached', { defaultValue: `最多支持 ${MAX_TASKS} 个提醒，已达上限` }));
    }
  }, [atLimit, t]);

  const handleSave = (draft: Task) => {
    if (editing?.mode === 'new') {
      addTask(draft);
    } else if (editing?.mode === 'edit' && editing.taskId) {
      updateTask(editing.taskId, draft);
    }
    syncTasks(useHealthStore.getState().tasks);
    setEditing(null);
  };

  const handleDelete = () => {
    if (editing?.mode === 'edit' && editing.taskId) {
      removeTask(editing.taskId);
      syncTasks(useHealthStore.getState().tasks);
    }
    setEditing(null);
  };

  const handleToggle = (taskId: string) => {
    toggleTask(taskId);
    syncTasks(useHealthStore.getState().tasks);
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <AddReminderCard
          disabled={atLimit}
          onClick={() => {
            if (!atLimit) setEditing({ mode: 'new', draft: createEmptyTask() });
          }}
        />
        {tasks.map((task) => {
          const isDefault = DEFAULT_TASK_IDS.has(task.id);
          return (
            <ReminderSummaryCard
              key={task.id}
              task={task}
              isDefault={isDefault}
              onClick={() =>
                setEditing({ mode: 'edit', taskId: task.id, draft: { ...task } })
              }
              onToggle={() => handleToggle(task.id)}
            />
          );
        })}
      </div>

      <ReminderEditorDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={handleSave}
          onDelete={
            editing?.mode === 'edit' && editing.taskId && !DEFAULT_TASK_IDS.has(editing.taskId)
              ? handleDelete
              : undefined
          }
        allTasks={tasks}
        settings={settings}
      />
    </>
  );
}

function AddReminderCard({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Card
      className={cn(
        'cursor-pointer border border-dashed p-0 ring-0 rounded-[10px] transition-colors hover:bg-muted/40',
        disabled && 'pointer-events-none opacity-50',
      )}
      onClick={onClick}
    >
      <CardContent className="flex h-full flex-col items-center justify-center gap-1 p-3 text-muted-foreground">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Plus size={16} />
        </div>
        <span className="text-type-body font-medium">{t('settings.addCustomReminder')}</span>
      </CardContent>
    </Card>
  );
}

function ReminderSummaryCard({
  task,
  isDefault,
  onClick,
  onToggle,
}: {
  task: Task;
  isDefault: boolean;
  onClick: () => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-reminder-switch]')) {
      return;
    }
    onClick();
  };

  return (
    <Card
      className={cn(
        'cursor-pointer border border-border p-0 ring-0 rounded-[10px] transition-colors hover:bg-muted/40',
        !task.enabled && 'opacity-60',
      )}
      onClick={handleCardClick}
    >
      <CardContent className="p-3">
        {/* row 1: icon 容器 + switch (Figma: y=12-44, h=32) */}
        <div className="flex items-center justify-between">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <TaskIcon icon={task.icon} size={16} />
          </div>
          <div data-reminder-switch>
            <Switch
              checked={task.enabled}
              onCheckedChange={onToggle}
              className="shrink-0"
            />
          </div>
        </div>

        {/* row 2: title + badge / subtitle (Figma: y=49-93, h=44, gap 5 from row 1) */}
        <div className="mt-[5px]">
          {/* line 1: title + badge (h=22, gap 12) */}
          <div className="flex h-[22px] items-center gap-3">
            <span className="min-w-0 max-w-[140px] truncate text-type-card-title font-semibold leading-[var(--type-card-title-lh)] text-foreground">
              {task.title}
            </span>
            {isDefault && (
              <Badge className="h-5 shrink-0 rounded-full bg-muted px-2 text-type-badge font-medium leading-[var(--type-badge-lh)] text-secondary-foreground">
                {t('settings.defaultReminder')}
              </Badge>
            )}
          </div>
          {/* line 2: subtitle (h=18, gap 4 from line 1) */}
          <div className="mt-1 text-type-caption leading-[var(--type-caption-lh)] text-muted-foreground">
            {task.scheduleType === 'daily' && task.dailyTime
              ? t('settings.reminderSubtitleDaily', { time: task.dailyTime })
              : t('settings.reminderSubtitleInterval', { interval: task.interval })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReminderEditorDialog({
  editing,
  onClose,
  onSave,
  onDelete,
  allTasks,
  settings,
}: {
  editing: EditingState | null;
  onClose: () => void;
  onSave: (draft: Task) => void;
  onDelete?: () => void;
  allTasks: Task[];
  settings: AppSettings;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Task | null>(null);

  useEffect(() => {
    setDraft(editing ? { ...editing.draft } : null);
  }, [editing]);

  const isDefault =
    editing?.mode === 'edit' && !!editing.taskId && DEFAULT_TASK_IDS.has(editing.taskId);

  const updateDraft = (patch: Partial<Task>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  if (!editing || !draft) return null;

  return (
    <Dialog open={!!editing} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!flex !flex-col !max-h-[80vh] !max-w-[440px] !overflow-hidden !p-0 !gap-0">
        <header className="flex-none border-b border-border px-4 pt-4 pb-3">
          <DialogTitle>
            {editing.mode === 'new' ? t('settings.newReminder') : t('settings.editReminder')}
          </DialogTitle>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* 名称 + 图标（图标只读，不可选） */}
          <div className="flex items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              <TaskIcon icon={draft.icon} size={14} />
            </div>
            <Input
              value={draft.title}
              onChange={(e) =>
                updateDraft({ title: e.target.value, desc: `${e.target.value}提醒` })
              }
              placeholder={t('settings.reminderNamePlaceholder')}
              readOnly={isDefault}
              className={cn('h-8 text-sm', isDefault && 'cursor-not-allowed opacity-60')}
            />
            {isDefault && (
              <Badge className="h-5 shrink-0 gap-1 rounded-full bg-muted px-2 text-type-badge font-medium leading-[var(--type-badge-lh)] text-secondary-foreground">
                <Lock size={10} />
                {t('settings.defaultReminder')}
              </Badge>
            )}
          </div>

          <Separator />

          {/* form fields - 永远显示，无折叠 */}
          <SettingRow label={t('settings.scheduleType')}>
            <ToggleGroup
              value={[draft.scheduleType]}
              onValueChange={(values) => {
                const v = values[0] as ScheduleType | undefined;
                if (!v) return;
                updateDraft({
                  scheduleType: v,
                  dailyTime: v === 'interval' ? null : draft.dailyTime ?? '09:00',
                });
              }}
              className="flex rounded-md bg-muted p-0.5"
            >
              <Toggle
                value="interval"
                className="flex-1 whitespace-nowrap rounded-sm px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-sm"
              >
                {t('settings.interval')}
              </Toggle>
              <Toggle
                value="daily"
                className="flex-1 whitespace-nowrap rounded-sm px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-sm"
              >
                {t('settings.fixedTime')}
              </Toggle>
            </ToggleGroup>
          </SettingRow>

          {draft.scheduleType === 'interval' ? (
            <SettingRow label={t('settings.interval')}>
              <NumField
                value={draft.interval}
                min={5}
                max={180}
                step={5}
                suffix={t('time.minutes')}
                onCommit={(v) => updateDraft({ interval: v })}
              />
            </SettingRow>
          ) : (
            <SettingRow label={t('settings.time')}>
              <DailyTimeField
                value={draft.dailyTime}
                onChange={(v) => updateDraft({ dailyTime: v })}
              />
            </SettingRow>
          )}

          {settings.lockScreenEnabled && draft.scheduleType === 'interval' && (
            <MergeWarning current={draft} all={allTasks} threshold={settings.mergeThreshold} />
          )}

          <SettingRow label={t('settings.preNotify')}>
            <NumField
              value={draft.preNotificationSeconds}
              min={0}
              max={120}
              step={5}
              suffix={t('settings.seconds')}
              onCommit={(v) => updateDraft({ preNotificationSeconds: v })}
            />
          </SettingRow>

          <SettingRow label={t('settings.lockDuration')}>
            {draft.isExerciseTask ? (
              <span className="text-type-body tabular-nums text-muted-foreground">
                {formatDuration(computeExerciseDuration(draft.exerciseIds))}
              </span>
            ) : (
              <NumField
                value={draft.lockDuration}
                min={10}
                max={600}
                step={10}
                suffix={t('settings.seconds')}
                onCommit={(v) => updateDraft({ lockDuration: v })}
              />
            )}
          </SettingRow>

          <Separator />

          {/* 锁屏锻炼 section - chips + 5 分类 + 33 运动，全部 inline 展示 */}
          <SettingRow
            label={t('settings.lockScreenExerciseEditor')}
            desc={t('settings.lockScreenExerciseEditorDesc')}
            icon={Dumbbell}
          >
            <Switch
              checked={!!draft.isExerciseTask}
              onCheckedChange={(v) =>
                updateDraft({
                  isExerciseTask: v,
                  exerciseIds: v ? (draft.exerciseIds ?? []) : undefined,
                })
              }
            />
          </SettingRow>

          {draft.isExerciseTask && (
            <ExerciseSelector
              selectedIds={draft.exerciseIds ?? []}
              onChange={(ids) => updateDraft({ exerciseIds: ids })}
            />
          )}
        </div>

        <footer className="flex flex-none items-center justify-between gap-2 border-t border-border bg-card px-4 py-3">
          {onDelete ? (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 size={14} /> {t('settings.deleteReminder')}
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('settings.cancel')}
            </Button>
            <Button size="sm" onClick={() => onSave(draft)} disabled={!draft.title.trim()}>
              {t('settings.save')}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function NumField({
  value,
  min,
  max,
  step,
  suffix,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const num = Math.max(min, Math.min(max, parseInt(draft, 10) || value));
          setDraft(String(num));
          onCommit(num);
        }}
        className="h-7 w-16 text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="text-xs text-muted-foreground">{suffix}</span>
    </div>
  );
}

function DailyTimeField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  const [hour, minute] = (value ?? '09:00').split(':');
  const h = Number(hour);
  const m = Number(minute);

  return (
    <div className="flex items-center gap-1.5">
      <NumberField.Root
        value={h}
        min={0}
        max={23}
        onValueChange={(v) => onChange(`${String(v).padStart(2, '0')}:${minute}`)}
      >
        <NumberField.Input
          className={cn(
            'h-7 w-16 rounded-md border border-input bg-transparent',
            'px-2.5 py-1 text-center text-xs',
            'transition-colors outline-none',
            'placeholder:text-muted-foreground',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
            'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
            'dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
            '[appearance:textfield]',
            '[&::-webkit-outer-spin-button]:appearance-none',
            '[&::-webkit-inner-spin-button]:appearance-none',
          )}
        />
      </NumberField.Root>
      <span className="text-sm text-muted-foreground">:</span>
      <NumberField.Root
        value={m}
        min={0}
        max={59}
        onValueChange={(v) => onChange(`${hour}:${String(v).padStart(2, '0')}`)}
      >
        <NumberField.Input
          className={cn(
            'h-7 w-16 rounded-md border border-input bg-transparent',
            'px-2.5 py-1 text-center text-xs',
            'transition-colors outline-none',
            'placeholder:text-muted-foreground',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
            'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
            'dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
            '[appearance:textfield]',
            '[&::-webkit-outer-spin-button]:appearance-none',
            '[&::-webkit-inner-spin-button]:appearance-none',
          )}
        />
      </NumberField.Root>
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

  useEffect(() => {
    setIdleInputValue(String(settings.idleThreshold));
  }, [settings.idleThreshold]);

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
    useHealthStore.getState().tasks.forEach((t) => updateTask(t.id, { autoResetOnIdle: checked }));
    syncTasks(useHealthStore.getState().tasks.map((t) => ({ ...t, autoResetOnIdle: checked })));
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
      <SettingRow
        label={t('settings.language')}
        desc={t('settings.languageDesc')}
        icon={Globe}
      >
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
          <SelectTrigger className="w-[100px]">
            <SelectValue>
              {(value) => LOCALES.find((l) => l.code === value)?.name ?? value}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        label={t('settings.theme')}
        desc={t('settings.themeDesc')}
        icon={ThemeIcon}
      >
        <Select
          value={settings.theme}
          onValueChange={(value) => handleThemeSelect(value as 'light' | 'dark' | 'system')}
        >
          <SelectTrigger className="w-[100px]">
            <SelectValue>
              {(value) => {
                const opt = THEME_OPTIONS.find((o) => o.value === value);
                if (!opt) return value;
                const Icon = opt.icon;
                return (
                  <span className="flex items-center gap-1.5">
                    <Icon size={12} /> {t(opt.labelKey)}
                  </span>
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-1.5">
                    <Icon size={12} /> {t(opt.labelKey)}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </SettingRow>

      <Separator className="my-2" />

      <SettingRow
        label={t('settings.autoUnlock')}
        desc={t('settings.autoUnlockDesc')}
        icon={LockOpen}
      >
        <Switch checked={settings.autoUnlock} onCheckedChange={handleAutoUnlockToggle} />
      </SettingRow>

      <SettingRow
        label={t('settings.resetOnIdle')}
        desc={t('settings.resetOnIdleDesc')}
        icon={RefreshCw}
      >
        <Switch checked={settings.autoResetOnIdle} onCheckedChange={handleResetOnIdleToggle} />
      </SettingRow>

      <SettingRow
        label={t('settings.idleThreshold')}
        desc={t('settings.idleThresholdDesc')}
        icon={Timer}
      >
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
      </SettingRow>

      <SettingRow
        label={t('settings.autoStart')}
        desc={t('settings.autoStartDesc')}
        icon={Power}
      >
        <Switch checked={settings.autoStart} onCheckedChange={handleAutoStartToggle} />
      </SettingRow>
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
  const tasks = useHealthStore((s) => s.tasks);

  const [mergeInputValue, setMergeInputValue] = useState(String(settings.mergeThreshold));

  const exerciseEnabledCount = tasks.filter((t) => t.isExerciseTask).length;

  const handleLockScreenToggle = async (checked: boolean) => {
    // 联动：开强制全屏时自动开锁屏锻炼（Q65-A 单向）
    const updates: Partial<AppSettings> = checked
      ? { lockScreenEnabled: true, lockScreenExerciseEnabled: true }
      : { lockScreenEnabled: false };
    updateSettings(updates);
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, ...updates }).catch(console.error);
    await emitSettingsUpdated(updates).catch(console.error);
  };

  const handleLockScreenExerciseToggle = async (checked: boolean) => {
    if (checked && exerciseEnabledCount === 0) return;
    updateSettings({ lockScreenExerciseEnabled: checked });
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, lockScreenExerciseEnabled: checked }).catch(console.error);
    await emitSettingsUpdated({ lockScreenExerciseEnabled: checked }).catch(console.error);
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
      <SettingRow
        label={t('settings.lockScreen')}
        desc={t('settings.lockScreenDesc')}
        icon={Lock}
      >
        <Switch checked={settings.lockScreenEnabled} onCheckedChange={handleLockScreenToggle} />
      </SettingRow>

      {settings.lockScreenEnabled && (
        <>
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

          <SettingRow
            label={t('settings.lockScreenExercise')}
            desc={
              exerciseEnabledCount === 0
                ? t('settings.lockScreenExerciseNoConfig')
                : t('settings.lockScreenExerciseCount', { count: exerciseEnabledCount })
            }
            icon={Dumbbell}
          >
            <Switch
              checked={settings.lockScreenExerciseEnabled}
              disabled={exerciseEnabledCount === 0}
              onCheckedChange={handleLockScreenExerciseToggle}
            />
          </SettingRow>
        </>
      )}

      <SettingRow
        label={t('settings.strictMode')}
        desc={t('settings.strictModeDesc')}
        icon={Shield}
        destructive
      >
        <Switch checked={settings.strictMode} onCheckedChange={handleStrictModeToggle} />
      </SettingRow>
    </div>
  );
}

// ============================================================================
// Settings wrapper with Tabs
// ============================================================================

interface SettingsProps {
  isStandalone?: boolean;
  initialTab?: string;
}

export function Settings({ isStandalone = false, initialTab }: SettingsProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(initialTab || 'reminders');

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex flex-col"
    >
      <div className="sticky top-0 z-10 rounded-t-[14px] bg-card px-4 pt-3 pb-0">
        <TabsList variant="line" className="w-fit gap-2">
          <TabsTrigger
            value="reminders"
            className="flex-none text-sm data-active:font-semibold"
          >
            {t('settings.taskManagement')}
          </TabsTrigger>
          <TabsTrigger
            value="general"
            className="flex-none text-sm data-active:font-semibold"
          >
            {t('settings.general')}
          </TabsTrigger>
          <TabsTrigger
            value="advanced"
            className="flex-none text-sm data-active:font-semibold"
          >
            {t('settings.advanced')}
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

// ============================================================================
// 锁屏锻炼 — chips + 5 分类 Tabs（tab 切换不改变 dialog 高度）
// ============================================================================

function ExerciseSelector({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<keyof typeof categoryNames>('spine');

  const handleRemove = (id: string) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  const handleToggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  const categories: Array<keyof typeof categoryNames> = [
    'spine',
    'circulation',
    'metabolism',
    'vision',
    'wrist',
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-type-caption">
        <span className="text-muted-foreground">
          {t('settings.exerciseSelectedCount', { count: selectedIds.length })}
        </span>
        {selectedIds.length > 10 && (
          <span className="flex items-center gap-1 text-warning">
            <Bell size={10} className="shrink-0" />
            {t('settings.exerciseTooManyWarn', {
              count: selectedIds.length,
              minutes: Math.round(computeExerciseDuration(selectedIds) / 60),
            })}
          </span>
        )}
      </div>

      {/* chips 区域 - 无折叠、无 max-h */}
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const ex = exercises.find((e) => e.id === id);
            return (
              <Badge
                key={id}
                variant="secondary"
                className="h-6 gap-1 rounded-full bg-secondary px-2 text-type-badge font-medium leading-[var(--type-badge-lh)] text-secondary-foreground"
              >
                <span className="max-w-[120px] truncate">{ex?.name ?? id}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(id)}
                  className="ml-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  aria-label="Remove"
                >
                  <X size={10} />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          {t('settings.exerciseEmptyWarn')}
        </div>
      )}

      {/* Tabs - 5 分类，line 样式，Panel 加 keepMounted（base-ui 库内建）*/}
      <Tabs
        value={activeCategory}
        onValueChange={(v) => setActiveCategory(v as keyof typeof categoryNames)}
      >
        <TabsList variant="line" className="w-full justify-start gap-0 border-b border-border">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat}
              value={cat}
              className="flex-1 text-xs text-muted-foreground transition-colors -mb-px data-active:font-semibold data-active:text-foreground"
            >
              {categoryNames[cat]}
            </TabsTrigger>
          ))}
          {/* 不渲染 <Tabs.Indicator>，无下划线动画 */}
        </TabsList>
        {categories.map((cat) => (
          <TabsContent
            key={cat}
            value={cat}
            keepMounted
            className="min-h-[250px] !flex-none"
          >
            <div className="space-y-0.5 pt-1">
              {exercises.filter((e) => e.category === cat).map((ex) => {
                const checked = selectedIds.includes(ex.id);
                return (
                  <label
                    key={ex.id}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted/60 has-[input:checked]:bg-primary/5'
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => handleToggle(ex.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{ex.name}</span>
                    <span className="shrink-0 text-type-caption text-muted-foreground tabular-nums">
                      {formatExerciseDuration(computeExerciseDuration([ex.id]))}
                    </span>
                  </label>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}