import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { useHealthStore } from '../store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import Overflow from 'rc-overflow';
import { setAutoStart, saveSettingsToBackend, emitSettingsUpdated, syncTasks, setIdleThreshold, setEntertainmentIdleThreshold, setEntertainmentReminder, setEntertainmentExitThreshold, setEntertainmentModeEnabled, updateTrayLanguage, listRunningWindows, syncEntertainmentApps, setAppMode as setAppModeBackend, setEntertainmentOpacity, setEntertainmentSnoozeMinutes } from '../services';
import { Shield, AlertTriangle, Sun, Moon, Monitor, Globe, Plus, X, Bell, Trash2, Timer, Lock, LockOpen, RefreshCw, Power, Gamepad2, Combine, Dumbbell, BellRing, CircleMinus, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NumberField } from '@base-ui/react/number-field';
import { Input } from '@/components/ui/input';
import { SuffixedNumberField } from './SuffixedNumberField';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';

import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Field, FieldContent, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Chip } from '@/components/ui/chip';
import { TaskIcon } from './Icons';
import type { Task, ScheduleType, AppSettings, AppMode, EntertainmentAppRule } from '../types';
import { exercises, categoryNames } from '../data/exercises';
import { formatDuration } from '../utils/time';
import { computeExerciseDuration, formatExerciseDuration } from '../utils/exercise';

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

// 纯函数：找出与 current 时间相近的任务（含 interval / daily 两种调度方式）。
// 抽离出来以便弹窗 header 的紧凑标记与下方整句警告共用同一判定，保证文案一致。
function findSimilarTasks(
  current: Task,
  all: Task[],
  threshold: number,
  taskStates: Record<string, { countdown?: number }>,
): Task[] {
  const predictedRemaining = (task: Task): number => {
    const live = taskStates[task.id]?.countdown;
    return live ?? task.interval * 60;
  };

  return all.filter((other) => {
    if (other.id === current.id) return false;
    if (other.scheduleType !== current.scheduleType) return false;

    if (current.scheduleType === 'interval') {
      // 与后端 merge_window_seconds（= threshold*60）对齐：剩余时间差在窗口内即视为近似
      return Math.abs(predictedRemaining(current) - predictedRemaining(other)) <= threshold * 60;
    }

    if (current.scheduleType === 'daily' && current.dailyTime && other.dailyTime) {
      return timeDiffInMinutes(current.dailyTime, other.dailyTime) <= threshold;
    }

    return false;
  });
}

// 纯函数：把相近任务列表格式化为提示文案（names + 按 appMode 决定的后缀）。
// 抽出供弹窗外的浮动 Alert 与 header 徽章共用，保证文案一致。
function formatSimilarWarning(
  similarTasks: Task[],
  appMode: AppMode,
): { names: string; suffix: string } | null {
  if (similarTasks.length === 0) return null;

  const names =
    similarTasks.length > 2
      ? `${similarTasks.slice(0, 2).map((t) => t.title).join('、')} 等 ${similarTasks.length} 个`
      : similarTasks.map((t) => t.title).join('、');
  const suffix =
    appMode === 'lock'
      ? '，锁屏提醒会合并为一次触发'
      : appMode === 'floating'
        ? '，悬浮胶囊会多次进入提醒态'
        : '，将连续弹出多条通知';

  return { names, suffix };
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
    <div className="flex items-center justify-between gap-3 py-2">
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
      toast.info(t('settings.taskLimitReached'));
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
        <span className="text-type-body">{t('settings.addCustomReminder')}</span>
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
            <span className="min-w-0 max-w-[140px] truncate text-type-section-title leading-[var(--type-section-title-lh)] text-foreground">
              {t(`tasks.${task.id}.title`, { defaultValue: task.title })}
            </span>
            {isDefault && (
              <Badge className="h-5 shrink-0 rounded-full bg-muted px-2 text-type-badge leading-none text-secondary-foreground">
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
  const appMode = useHealthStore((s) => s.appMode);
  const taskStates = useHealthStore((s) => s.taskStates);
  const [draft, setDraft] = useState<Task | null>(null);
  const [subView, setSubView] = useState<'form' | 'exercise'>('form');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  useEffect(() => {
    if (editing) {
      setDraft({ ...editing.draft });
      setSubView('form');
    } else {
      setDraft(null);
    }
  }, [editing]);

  const isDefault =
    editing?.mode === 'edit' && !!editing.taskId && DEFAULT_TASK_IDS.has(editing.taskId);

  // 标题右上方"时间相近"紧凑标记：与弹窗外的浮动 Alert 共用同一判定与文案
  const similar =
    draft !== null
      ? formatSimilarWarning(
          findSimilarTasks(draft, allTasks, settings.mergeThreshold, taskStates),
          appMode,
        )
      : null;

  const updateDraft = (patch: Partial<Task>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  if (!editing || !draft) return null;

  // 锁屏时长预览：若本提醒开启了锁屏锻炼，时长由运动决定
  const showsExerciseDuration =
    settings.lockScreenExerciseEnabled && (draft.exerciseIds?.length ?? 0) > 0;

  // id → name 映射，供 form 内只读预览 chips 使用
  const exerciseNameById = (id: string) =>
    exercises.find((e) => e.id === id)?.name ?? id;

  // 下钻视图切换动画变体：前进从右滑入、后退从左滑入（仿 iOS drill-down）
  const bodyVariants = {
    enter: (dir: 'forward' | 'back') => ({ opacity: 0, x: dir === 'forward' ? 24 : -24 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: 'forward' | 'back') => ({ opacity: 0, x: dir === 'forward' ? -24 : 24 }),
  };

  const handleOpenChange = (open: boolean) => {
    // exercise 视图下 ESC/backdrop 仅退回 form 视图，不直接关闭（防 draft 丢失）
    if (!open && subView === 'exercise') {
      setDirection('back');
      setSubView('form');
      return;
    }
    if (!open) onClose();
  };

  return (
    <Dialog open={!!editing} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={subView !== 'exercise'} className="!flex !flex-col !max-h-[80vh] !max-w-[440px] !overflow-hidden !p-0 !gap-0">
        {subView === 'exercise' ? (
          <header className="flex-none border-b border-border px-4 pt-4 pb-3">
            <DialogTitle>{draft.title ? t('settings.selectExerciseTitleFor', { title: draft.title }) : t('settings.selectExerciseTitle')}</DialogTitle>
          </header>
        ) : (
          <header className="flex-none border-b border-border px-4 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <DialogTitle>
                {editing.mode === 'new' ? t('settings.newReminder') : t('settings.editReminder')}
              </DialogTitle>
            </div>
          </header>
        )}

        <AnimatePresence mode="wait" custom={direction} initial={false}>
          {subView === 'exercise' ? (
            <motion.div
              key="exercise"
              custom={direction}
              variants={bodyVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="h-[400px] overflow-y-auto px-4 py-3"
            >
              <ExerciseSelector
                selectedIds={draft.exerciseIds ?? []}
                onChange={(ids) => updateDraft({ exerciseIds: ids })}
              />
            </motion.div>
          ) : (
            <motion.div
              key="form"
              custom={direction}
              variants={bodyVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="h-[400px] overflow-y-auto px-4 py-3 space-y-3"
            >
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
                <Badge className="h-5 shrink-0 gap-1 rounded-full bg-muted px-2 text-type-badge leading-none text-secondary-foreground">
                  <Lock size={10} />
                  {t('settings.defaultReminder')}
                </Badge>
              )}
            </div>

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
                size="sm"
              >
                <ToggleGroupItem value="interval" className="flex-1">
                  {t('settings.interval')}
                </ToggleGroupItem>
                <ToggleGroupItem value="daily" className="flex-1">
                  {t('settings.fixedTime')}
                </ToggleGroupItem>
              </ToggleGroup>
            </SettingRow>

            {draft.scheduleType === 'interval' ? (
              <div>
                <SettingRow label={t('settings.interval')}>
                  <SuffixedNumberField
                    value={draft.interval}
                    min={5}
                    max={180}
                    step={5}
                    suffix={t('time.minutes')}
                    onCommit={(v) => updateDraft({ interval: v })}
                  />
                </SettingRow>
              </div>
            ) : (
              <div>
                <SettingRow label={t('settings.time')}>
                  <DailyTimeField
                    value={draft.dailyTime}
                    onChange={(v) => updateDraft({ dailyTime: v })}
                  />
                </SettingRow>
              </div>
            )}

            <SettingRow label={t('settings.preNotify')}>
              <SuffixedNumberField
                value={draft.preNotificationSeconds}
                min={0}
                max={120}
                step={5}
                suffix={t('settings.seconds')}
                onCommit={(v) => updateDraft({ preNotificationSeconds: v })}
              />
            </SettingRow>

            <SettingRow label={t('settings.lockDuration')}>
              {showsExerciseDuration ? (
                <span className="text-type-body tabular-nums text-muted-foreground">
                  {formatDuration(computeExerciseDuration(draft.exerciseIds ?? []))}
                </span>
              ) : (
                <SuffixedNumberField
                  value={draft.lockDuration ?? 60}
                  min={10}
                  max={600}
                  step={10}
                  suffix={t('settings.seconds')}
                  onCommit={(v) => updateDraft({ lockDuration: v })}
                />
              )}
            </SettingRow>

            {/* 锁屏运动区：可点击的 drill-down 卡片，整块进入子视图 */}
            <button
              type="button"
              onClick={() => { setDirection('forward'); setSubView('exercise'); }}
              aria-label={t('settings.customizeExercise')}
              className="group flex w-full flex-col gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left ring-0 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center gap-3">
                {/* 标题 + 描述 */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium leading-tight">{t('settings.lockScreenExerciseEditor')}</div>
                  <div className="truncate text-xs leading-tight text-muted-foreground">{t('settings.lockScreenExerciseEditorDesc')}</div>
                </div>
                {/* 右侧下钻指示 */}
                <ChevronRight size={16} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>

              {/* 已选运动只读预览 - 复用 Chip + rc-overflow 响应式折叠 */}
              {(draft.exerciseIds?.length ?? 0) > 0 && (
                <Overflow
                  data={draft.exerciseIds!}
                  maxCount="responsive"
                  itemKey={(id: string) => id}
                  className="flex flex-wrap gap-1.5"
                  renderItem={(id: string) => (
                    <Chip variant="secondary" className="h-6 rounded-full px-2 text-type-badge pt-[2.5px] pb-[1.5px]">
                      {exerciseNameById(id)}
                    </Chip>
                  )}
                  renderRest={() => (
                    <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-secondary px-2 text-type-badge pt-[2.5px] pb-[1.5px] text-secondary-foreground">
                      +{draft.exerciseIds!.length}
                    </span>
                  )}
                />
              )}
            </button>
            </motion.div>
          )}
        </AnimatePresence>

        {subView === 'exercise' ? (
          <footer className="flex h-14 flex-none items-center justify-end gap-2 border-t border-border bg-card px-4">
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 leading-none" onClick={() => { setDirection('back'); setSubView('form'); }}>
              <ChevronLeft size={14} />
              {t('settings.back')}
            </Button>
            <Button size="sm" onClick={() => { setDirection('back'); setSubView('form'); }}>
              {t('settings.done')}
            </Button>
          </footer>
        ) : (
          <footer className="flex h-14 flex-none items-center justify-between gap-3 border-t border-border bg-card px-4">
            {/* 左侧：删除按钮（按需）+ 时间相近提醒，弹性区可截断 */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {onDelete && (
                <Button variant="destructive" size="sm" onClick={onDelete}>
                  <Trash2 size={14} /> {t('settings.deleteReminder')}
                </Button>
              )}
              {similar && (
                <span className="flex min-w-0 items-center gap-1.5 text-warning">
                  <Bell size={14} className="shrink-0" />
                  <span className="truncate text-xs">
                    与 {similar.names} 时间相近{similar.suffix}
                  </span>
                </span>
              )}
            </div>
            {/* 右侧：取消 / 保存，固定不压缩 */}
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t('settings.cancel')}
              </Button>
              <Button size="sm" onClick={() => onSave(draft)} disabled={!draft.title.trim()}>
                {t('settings.save')}
              </Button>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
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
            'h-8 w-16 rounded-md border border-input bg-transparent',
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
            'h-8 w-16 rounded-md border border-input bg-transparent',
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
          <SelectTrigger>
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
            <SelectTrigger>
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
        <SuffixedNumberField
          value={settings.idleThreshold}
          min={1}
          max={60}
          suffix={t('time.minutes')}
          onCommit={handleIdleThresholdChange}
        />
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
// 模式选择器（三态卡片）
// ============================================================================

function ModeSelector() {
  const { t } = useTranslation();
  const appMode = useHealthStore((s) => s.appMode);
  const setAppMode = useHealthStore((s) => s.setAppMode);

  const modes: Array<{
    key: AppMode;
    icon: LucideIcon;
    titleKey: string;
    descKey: string;
  }> = [
    { key: 'notification', icon: BellRing, titleKey: 'settings.modeNotification', descKey: 'settings.modeNotificationDesc' },
    { key: 'floating', icon: Gamepad2, titleKey: 'settings.modeFloating', descKey: 'settings.modeFloatingDesc' },
    { key: 'lock', icon: Lock, titleKey: 'settings.modeLock', descKey: 'settings.modeLockDesc' },
  ];

  const handleSelect = async (mode: AppMode) => {
    if (mode === appMode) return;
    setAppMode(mode);
    await setAppModeBackend(mode).catch(console.error);
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend(currentSettings).catch(console.error);
  };

  return (
    <div className="grid grid-cols-3 gap-2 pb-3">
      {modes.map((m) => {
        const Icon = m.icon;
        const selected = appMode === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => handleSelect(m.key)}
            className={cn(
              'flex flex-col rounded-xl border p-2.5 text-left transition-all duration-150 cursor-pointer',
              selected
                ? 'border-primary ring-1 ring-primary/20 bg-primary/[0.03]'
                : 'border-border hover:bg-muted/40',
            )}
          >
            <div className="flex items-center gap-2">
              <Icon
                size={16}
                className={selected ? 'text-primary' : 'text-muted-foreground'}
              />
              <span
                className={cn(
                  'text-sm font-medium',
                  selected ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t(m.titleKey)}
              </span>
            </div>
            <span className="mt-2 text-xs text-muted-foreground">
              {t(m.descKey)}
            </span>
          </button>
        );
      })}
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
  const appMode = useHealthStore((s) => s.appMode);
  const settings = useHealthStore((s) => s.settings);
  const updateSettings = useHealthStore((s) => s.updateSettings);

  const tasks = useHealthStore((s) => s.tasks);
  const exerciseEnabledCount = tasks.filter((t) => (t.exerciseIds?.length ?? 0) > 0).length;
  const [strictModeWarningOpen, setStrictModeWarningOpen] = useState(false);
  const [strictModeCountdown, setStrictModeCountdown] = useState(10);

  useEffect(() => {
    if (!strictModeWarningOpen || strictModeCountdown <= 0) return;
    const timer = setTimeout(() => setStrictModeCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [strictModeWarningOpen, strictModeCountdown]);

  const [showAllAppsDialog, setShowAllAppsDialog] = useState(false);

  const handleMergeThresholdChange = async (value: number) => {
    const clamped = Math.max(1, Math.min(30, value));
    updateSettings({ mergeThreshold: clamped });
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, mergeThreshold: clamped }).catch(console.error);
    await emitSettingsUpdated({ mergeThreshold: clamped }).catch(console.error);
  };

  const handleLockScreenExerciseToggle = async (checked: boolean) => {
    updateSettings({ lockScreenExerciseEnabled: checked });
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, lockScreenExerciseEnabled: checked }).catch(console.error);
    await emitSettingsUpdated({ lockScreenExerciseEnabled: checked }).catch(console.error);
  };

  const handleStrictModeToggle = async (checked: boolean) => {
    if (checked) {
      setStrictModeWarningOpen(true);
      setStrictModeCountdown(10);
      return;
    }
    updateSettings({ strictMode: false });
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, strictMode: false }).catch(console.error);
    await emitSettingsUpdated({ strictMode: false }).catch(console.error);
  };

  const handleStrictModeConfirm = async () => {
    if (strictModeCountdown > 0) return;
    updateSettings({ strictMode: true });
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend({ ...currentSettings, strictMode: true }).catch(console.error);
    await emitSettingsUpdated({ strictMode: true }).catch(console.error);
    setStrictModeWarningOpen(false);
  };

  // 浮窗模式设置
  const [draftOpacity, setDraftOpacity] = useState(settings.floatingOpacity);
  const [draftEntOpacity, setDraftEntOpacity] = useState(settings.entertainmentOpacity);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraftOpacity(settings.floatingOpacity);
  }, [settings.floatingOpacity]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (entSaveTimerRef.current) clearTimeout(entSaveTimerRef.current);
    };
  }, []);

  const persistEntertainmentSettings = async (patch: Partial<AppSettings>) => {
    updateSettings(patch);
    const currentSettings = useHealthStore.getState().settings;
    await saveSettingsToBackend(currentSettings).catch(console.error);
    await emitSettingsUpdated(currentSettings as unknown as Record<string, unknown>).catch(console.error);

    if (patch.entertainmentApps !== undefined) {
      await syncEntertainmentApps(currentSettings.entertainmentApps).catch(console.error);
    }
    if (patch.entertainmentModeEnabled !== undefined) {
      await setEntertainmentModeEnabled(patch.entertainmentModeEnabled).catch(console.error);
    }
    if (patch.entertainmentIdleThreshold !== undefined) {
      await setEntertainmentIdleThreshold(patch.entertainmentIdleThreshold).catch(console.error);
    }
    if (patch.entertainmentExitThreshold !== undefined) {
      await setEntertainmentExitThreshold(patch.entertainmentExitThreshold).catch(console.error);
    }
    if (patch.entertainmentReminderMinutes !== undefined) {
      await setEntertainmentReminder(patch.entertainmentReminderMinutes).catch(console.error);
    }
    if (patch.entertainmentOpacity !== undefined) {
      await setEntertainmentOpacity(currentSettings.entertainmentOpacity).catch(console.error);
    }
    if (patch.entertainmentSnoozeMinutes !== undefined) {
      await setEntertainmentSnoozeMinutes(currentSettings.entertainmentSnoozeMinutes).catch(console.error);
    }
  };

  const handleOpacityChange = (value: number) => {
    setDraftOpacity(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateSettings({ floatingOpacity: value });
      persistEntertainmentSettings({ floatingOpacity: value });
    }, 300);
  };

  const handleSnoozeChange = (value: number) => {
    persistEntertainmentSettings({ floatingSnoozeMinutes: value });
  };

  const handleEntOpacityChange = (value: number) => {
    setDraftEntOpacity(value);
    if (entSaveTimerRef.current) clearTimeout(entSaveTimerRef.current);
    entSaveTimerRef.current = setTimeout(() => {
      updateSettings({ entertainmentOpacity: value });
      persistEntertainmentSettings({ entertainmentOpacity: value });
    }, 300);
  };

  const handleEntSnoozeChange = (value: number) => {
    persistEntertainmentSettings({ entertainmentSnoozeMinutes: value });
  };

  const handleEntertainmentIdleThresholdChange = async (value: number) => {
    const clamped = Math.max(5, Math.min(120, value));
    // FE-1.4 修复：删除直接 IPC 调用，只保留 persistEntertainmentSettings
    // （其内部已调 setEntertainmentIdleThreshold，避免重复 IPC）
    persistEntertainmentSettings({ entertainmentIdleThreshold: clamped });
  };

  const handleEntertainmentExitThresholdChange = async (value: number) => {
    const clamped = Math.max(1, Math.min(10, value));
    persistEntertainmentSettings({ entertainmentExitThreshold: clamped });
  };

  const handleEntertainmentReminderChange = async (value: number) => {
    const clamped = Math.max(5, Math.min(120, value));
    // FE-1.4 修复：删除直接 IPC 调用，只保留 persistEntertainmentSettings
    // （其内部已调 setEntertainmentReminder，避免重复 IPC）
    persistEntertainmentSettings({ entertainmentReminderMinutes: clamped });
  };

  // 前台应用管理
  const [dialogOpen, setDialogOpen] = useState(false);
  const [runningWindows, setRunningWindows] = useState<Array<{ title: string; process: string }>>([]);
  const [selectedWindow, setSelectedWindow] = useState('');

  const handleAddApp = async () => {
    try {
      const windows = await listRunningWindows();
      setRunningWindows(windows);
      setSelectedWindow('');
      setDialogOpen(true);
    } catch (e) {
      console.error('Failed to list running windows:', e);
    }
  };

  const handleConfirmAddApp = () => {
    if (!selectedWindow) return;
    const win = runningWindows.find((w) => `${w.process}|${w.title}` === selectedWindow);
    if (!win) return;
    const newApp: EntertainmentAppRule = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: win.title || win.process,
      matchType: 'process',
      pattern: win.process,
    };
    const apps = [...settings.entertainmentApps, newApp];
    persistEntertainmentSettings({ entertainmentApps: apps });
    setDialogOpen(false);
  };

  const handleRemoveApp = (id: string) => {
    const apps = settings.entertainmentApps.filter((a) => a.id !== id);
    persistEntertainmentSettings({ entertainmentApps: apps });
  };

  const windowItems = runningWindows.map((w) => ({
    value: `${w.process}|${w.title}`,
    label: `${w.title} (${w.process})`,
  }));

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
            value="mode"
            className="flex-none text-sm data-active:font-semibold"
          >
            {t('settings.alertStyle')}
          </TabsTrigger>
          <TabsTrigger
            value="entertainment"
            className="flex-none text-sm data-active:font-semibold"
          >
            {t('settings.entertainmentMode')}
          </TabsTrigger>
          <TabsTrigger
            value="general"
            className="flex-none text-sm data-active:font-semibold"
          >
            {t('settings.general')}
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <TabsContent value="reminders">
          <RemindersSection />
        </TabsContent>
        <TabsContent value="mode">
          <ModeSelector />

          {appMode === 'notification' && (
            <div className="flex flex-col items-center gap-1 py-6 text-center">
              <span className="text-sm font-medium text-muted-foreground">{t('settings.modeNotifNoSettings')}</span>
              <span className="text-xs text-muted-foreground">{t('settings.modeNotifNoSettingsDesc')}</span>
            </div>
          )}

          {appMode === 'lock' && (
            <div className="space-y-1">
              <SettingRow
                label={t('settings.mergeReminders')}
                desc={t('settings.mergeRemindersDesc')}
                icon={Combine}
              >
                <SuffixedNumberField
                  value={settings.mergeThreshold}
                  min={1}
                  max={30}
                  suffix={t('time.minutes')}
                  onCommit={handleMergeThresholdChange}
                />
              </SettingRow>
              <SettingRow
                label={t('settings.lockScreenExercise')}
                desc={t('settings.lockScreenExerciseDesc')}
                icon={Dumbbell}
              >
                <Switch
                  checked={settings.lockScreenExerciseEnabled}
                  onCheckedChange={handleLockScreenExerciseToggle}
                />
              </SettingRow>

              {settings.lockScreenExerciseEnabled && exerciseEnabledCount === 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  {t('settings.noExerciseConfiguredHint')}
                </p>
              )}
              <SettingRow
                label={t('settings.strictMode')}
                desc={t('settings.strictModeDesc')}
                icon={Shield}
                destructive
              >
                <Switch checked={settings.strictMode} onCheckedChange={handleStrictModeToggle} />
              </SettingRow>

              <Dialog open={strictModeWarningOpen} onOpenChange={setStrictModeWarningOpen}>
                <DialogContent showCloseButton={false}>
                  <DialogHeader>
                    <DialogTitle className="text-warning flex items-center gap-2">
                      <AlertTriangle size={16} />
                      {t('settings.strictModeWarningTitle')}
                    </DialogTitle>
                    <DialogDescription>
                      {t('settings.strictModeWarningDesc')}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setStrictModeWarningOpen(false)}>
                      {t('settings.strictModeWarningCancel')}
                    </Button>
                    <Button
                      onClick={handleStrictModeConfirm}
                      disabled={strictModeCountdown > 0}
                      variant="destructive"
                    >
                      {strictModeCountdown > 0
                        ? `${strictModeCountdown}s`
                        : t('settings.strictModeWarningConfirm')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {appMode === 'floating' && (
            <div className="space-y-1">
              {/* 浮窗行为（通用）：显示策略固定为 always 常驻显示 */}
              <SettingRow
                label={t('settings.floatingOpacity')}
                desc={t('settings.floatingOpacityDesc')}
              >
                <div className="flex items-center gap-3 w-60">
                  <Slider
                    value={[draftOpacity]}
                    min={20}
                    max={90}
                    step={5}
                    onValueChange={(values) => {
                      const v = Array.isArray(values) ? values[0] : values;
                      handleOpacityChange(v ?? draftOpacity);
                    }}
                    className="w-full"
                  />
                  <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{draftOpacity}%</span>
                </div>
              </SettingRow>
              <SettingRow
                label={t('settings.floatingSnoozeMinutes')}
                desc={t('settings.floatingSnoozeMinutesDesc')}
              >
                <SuffixedNumberField
                  value={settings.floatingSnoozeMinutes}
                  min={1}
                  max={30}
                  step={1}
                  suffix={t('time.minutes')}
                  onCommit={handleSnoozeChange}
                />
              </SettingRow>
            </div>
          )}
        </TabsContent>

        <TabsContent value="entertainment">
          {/* 娱乐模式 — 场景覆盖层，独立于提醒方式（notification/floating/lock） */}
          <div className="space-y-1">
            <SettingRow
              label={t('settings.entertainmentModeEnabled')}
              desc={t('settings.entertainmentModeEnabledDesc')}
            >
              <Switch
                checked={settings.entertainmentModeEnabled}
                onCheckedChange={(v) => persistEntertainmentSettings({ entertainmentModeEnabled: v })}
              />
            </SettingRow>

            {settings.entertainmentModeEnabled ? (
              <>
                {/* 触发应用列表 */}
                <div className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <Label className="flex items-center gap-1 text-sm">
                        <Gamepad2 size={14} />
                        {t('settings.entertainmentApps')}
                      </Label>
                      <span className="text-xs text-muted-foreground">{t('settings.entertainmentAppsDesc')}</span>
                    </div>
                    <Button variant="outline" onClick={handleAddApp}>
                      <Plus data-icon="inline-start" />
                      {t('settings.addEntertainmentApp')}
                    </Button>
                  </div>
                  {settings.entertainmentApps.length === 0 ? (
                    <div className="mt-3">
                      <span className="text-xs text-muted-foreground">{t('settings.noEntertainmentApps')}</span>
                    </div>
                  ) : (
                    <Overflow
                      data={settings.entertainmentApps}
                      maxCount="responsive"
                      itemKey={(app: EntertainmentAppRule) => app.id}
                      className="mt-3 flex gap-2"
                      renderItem={(app: EntertainmentAppRule) => (
                        <Chip
                          key={app.id}
                          variant="secondary"
                          className="h-6 rounded-full px-2 text-type-badge pt-[2.5px] pb-[1.5px]"
                          onRemove={() => handleRemoveApp(app.id)}
                        >
                          {app.name}
                        </Chip>
                      )}
                      renderRest={() => (
                        <button
                          type="button"
                          className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full border border-border px-2 text-type-badge pt-[2.5px] pb-[1.5px] text-muted-foreground cursor-pointer whitespace-nowrap select-none hover:bg-muted transition-colors"
                          onClick={() => setShowAllAppsDialog(true)}
                        >
                          +{settings.entertainmentApps.length}
                        </button>
                      )}
                    />
                  )}
                </div>

                <Dialog open={showAllAppsDialog} onOpenChange={setShowAllAppsDialog}>
                  <DialogContent className="max-w-[440px]">
                    <DialogHeader>
                      <DialogTitle>{t('settings.entertainmentApps')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-1 py-2">
                      {settings.entertainmentApps.map((app) => (
                        <div key={app.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/40">
                          <span className="text-sm">{app.name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveApp(app.id)}
                            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <CircleMinus size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setShowAllAppsDialog(false)}>
                        {t('settings.done')}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Separator />

                <SettingRow
                  label={t('settings.entertainmentIdleThreshold')}
                  desc={t('settings.entertainmentIdleThresholdDesc')}
                >
                  <SuffixedNumberField
                    value={settings.entertainmentIdleThreshold}
                    min={5}
                    max={120}
                    step={5}
                    suffix={t('time.minutes')}
                    onCommit={handleEntertainmentIdleThresholdChange}
                  />
                </SettingRow>
                <SettingRow
                  label={t('settings.entertainmentExitThreshold')}
                  desc={t('settings.entertainmentExitThresholdDesc')}
                >
                  <SuffixedNumberField
                    value={settings.entertainmentExitThreshold}
                    min={1}
                    max={10}
                    step={1}
                    suffix={t('time.minutes')}
                    onCommit={handleEntertainmentExitThresholdChange}
                  />
                </SettingRow>
                <SettingRow
                  label={t('settings.entertainmentReminderMinutes')}
                  desc={t('settings.entertainmentReminderMinutesDesc')}
                >
                  <SuffixedNumberField
                    value={settings.entertainmentReminderMinutes}
                    min={5}
                    max={120}
                    step={5}
                    suffix={t('time.minutes')}
                    onCommit={handleEntertainmentReminderChange}
                  />
                </SettingRow>
                <SettingRow
                  label={t('settings.entertainmentOpacity')}
                  desc={t('settings.entertainmentOpacityDesc')}
                >
                  <div className="flex items-center gap-3 w-60">
                    <Slider
                      value={[draftEntOpacity]}
                      min={20}
                      max={90}
                      step={5}
                      onValueChange={(values) => {
                        const v = Array.isArray(values) ? values[0] : values;
                        handleEntOpacityChange(v ?? draftEntOpacity);
                      }}
                      className="w-full"
                    />
                    <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{draftEntOpacity}%</span>
                  </div>
                </SettingRow>
                <SettingRow
                  label={t('settings.entertainmentSnoozeMinutes')}
                  desc={t('settings.entertainmentSnoozeMinutesDesc')}
                >
                  <SuffixedNumberField
                    value={settings.entertainmentSnoozeMinutes}
                    min={1}
                    max={30}
                    step={1}
                    suffix={t('time.minutes')}
                    onCommit={handleEntSnoozeChange}
                  />
                </SettingRow>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1 py-6 text-center">
                <span className="text-sm font-medium text-muted-foreground">{t('settings.entertainmentDisabledHint')}</span>
                <span className="text-xs text-muted-foreground">{t('settings.entertainmentDisabledHintDesc')}</span>
              </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent className="max-w-[440px]">
                <DialogHeader>
                  <DialogTitle>{t('settings.addEntertainmentApp')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('settings.selectRunningWindow')}</Label>
                    <Select items={windowItems} value={selectedWindow} onValueChange={(v) => setSelectedWindow(v ?? '')}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('settings.selectWindowPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {windowItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>{t('settings.cancel')}</Button>
                  <Button size="sm" onClick={handleConfirmAddApp} disabled={!selectedWindow}>
                    {t('settings.confirmAdd')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>
        <TabsContent value="general">
          <GeneralSection />
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

      {/* chips 区域 - 无折叠、无 max-h，复用统一 Chip 组件 */}
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const ex = exercises.find((e) => e.id === id);
            return (
              <Chip
                key={id}
                variant="secondary"
                className="h-6 rounded-full px-2 text-type-badge pt-[2.5px] pb-[1.5px]"
                onRemove={() => handleRemove(id)}
              >
                <span className="max-w-[120px] truncate">{ex?.name ?? id}</span>
              </Chip>
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