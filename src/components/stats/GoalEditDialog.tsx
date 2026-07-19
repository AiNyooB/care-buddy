import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { DEFAULT_DAILY_GOALS } from '@/constants';
import type { GoalKey, DailyGoals } from '@/types';
import { GOAL_ROW_CONFIG } from '@/constants/stats';

interface GoalEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: DailyGoals;
  onSave: (goals: DailyGoals) => void;
  onReset: () => void;
}

export function GoalEditDialog({ open, onOpenChange, goals, onSave, onReset }: GoalEditDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DailyGoals>(DEFAULT_DAILY_GOALS);

  // 打开时同步 props.goals 到本地 state
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

        <div className="flex flex-col gap-3">
          {GOAL_ROW_CONFIG.map(({ key, color, labelKey, labelDefault }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-type-caption text-muted-foreground">
                  {t(labelKey, { defaultValue: labelDefault })}
                </span>
                <span className="ml-auto text-sm font-semibold tabular-nums">{draft[key]}</span>
              </div>
              <Slider
                value={[draft[key]]}
                onValueChange={(val) => updateGoal(key, Array.isArray(val) ? val[0] : val)}
                min={0}
                max={50}
                step={1}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              onReset();
            }}
          >
            {t('stats.reset', { defaultValue: '重置默认' })}
          </Button>
          <Button
            variant="default"
            className="flex-[2] bg-primary"
            onClick={() => {
              onSave(draft);
            }}
          >
            {t('stats.save', { defaultValue: '保存' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
