import { useTranslation } from 'react-i18next';
import { useHealthStore } from '../store';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { pauseTimer, resumeTimer, updatePauseMenu, emitPauseStateUpdated, timerResetAll } from '../services';
import { Button } from '@/components/ui/button';

export function QuickActions() {
  const { t } = useTranslation();
  const isPaused = useHealthStore((s) => s.isPaused);
  const setPaused = useHealthStore((s) => s.setPaused);
  const resetAllTasks = useHealthStore((s) => s.resetAllTasks);

  const handlePauseToggle = async () => {
    const newPaused = !isPaused;
    setPaused(newPaused);
    if (newPaused) {
      await pauseTimer().catch(console.error);
    } else {
      await resumeTimer().catch(console.error);
    }
    await updatePauseMenu(newPaused).catch(console.error);
    await emitPauseStateUpdated(newPaused).catch(console.error);
  };

  const handleResetAll = async () => {
    resetAllTasks();
    await timerResetAll().catch(console.warn);
  };

  return (
    <div className="flex gap-2">
      <Button variant="default" onClick={handlePauseToggle}>
        {isPaused ? <Play size={16} /> : <Pause size={16} />}
        {isPaused ? t('buttons.resume') : t('buttons.pause')}
      </Button>
      <Button variant="secondary" onClick={handleResetAll}>
        <RotateCcw size={16} />
        {t('buttons.resetAll')}
      </Button>
    </div>
  );
}
