import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DEFAULT_DAILY_GOALS } from '@/constants';
import type { GoalKey, DailyGoals } from '@/types';
import { GOAL_ROW_CONFIG } from '@/constants/stats';

const MIN = 0;
const MAX = 50;

interface GoalEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: DailyGoals;
  onSave: (goals: DailyGoals) => void;
  onReset: () => void;
}

function StepperRow({
  color,
  label,
  value,
  onChange,
}: {
  color: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex h-9 items-center gap-2">
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 truncate text-sm text-foreground">{label}</span>
      <button
        type="button"
        disabled={value <= MIN}
        onClick={() => onChange(value - 1)}
        className="grid size-7 shrink-0 place-items-center rounded-md border border-border text-sm transition-colors hover:bg-muted disabled:opacity-30"
      >
        <Minus size={12} strokeWidth={2.5} />
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        disabled={value >= MAX}
        onClick={() => onChange(value + 1)}
        className="grid size-7 shrink-0 place-items-center rounded-md border border-border text-sm transition-colors hover:bg-muted disabled:opacity-30"
      >
        <Plus size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function GoalEditDialog({ open, onOpenChange, goals, onSave, onReset }: GoalEditDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DailyGoals>(DEFAULT_DAILY_GOALS);

  useEffect(() => {
    if (open) {
      setDraft(goals);
    }
  }, [open, goals]);

  const updateGoal = (key: GoalKey, value: number) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('stats.goalEdit', { defaultValue: '目标设定' })}</DialogTitle>
          <DialogDescription>
            {t('stats.editDailyGoal', { defaultValue: '编辑每日目标' })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          {GOAL_ROW_CONFIG.map(({ key, color, labelKey, labelDefault }) => (
            <StepperRow
              key={key}
              color={color}
              label={t(labelKey, { defaultValue: labelDefault })}
              value={draft[key]}
              onChange={(v) => updateGoal(key, v)}
            />
          ))}
        </div>

        <div className="mt-1 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onReset}>
            {t('stats.reset', { defaultValue: '重置默认' })}
          </Button>
          <Button variant="default" className="flex-[2] bg-primary" onClick={() => onSave(draft)}>
            {t('stats.save', { defaultValue: '保存' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
