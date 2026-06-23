import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { useHealthStore } from '@/store';
import { exercisePackages } from '@/data/exercises';
import { Play, Clock, Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PackageHero() {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const openExercisePanel = useHealthStore((s) => s.openExercisePanel);

  return (
    <div className="flex gap-3">
      {/* Hero 卡片 — 带动画 */}
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-border bg-card ring-0">
        <AnimatePresence mode="wait">
          {exercisePackages.map((pkg, i) => {
            if (i !== selectedIndex) return null;
            return (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="p-5"
              >
                {/* 图标 + 名称、统计 */}
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Dumbbell size={20} />
                  </div>
                  <div>
                    <h3 className="text-base leading-6 text-foreground">
                      {pkg.name}
                    </h3>
                    <span className="text-xs font-medium leading-4 text-primary">
                      {pkg.duration}{t('time.minutes')} · {pkg.exercises.length}{t('exercise.repetitions')}
                    </span>
                  </div>
                </div>

                {/* 描述 */}
                <p className="mb-3 text-sm leading-5 text-muted-foreground">
                  {pkg.description}
                </p>

                {/* 底行：频率 + CTA */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs font-medium leading-4 text-muted-foreground">
                    <Clock size={14} />
                    {pkg.recommendedFrequency}
                  </span>
                  <Button
                    className="h-10 rounded-full px-4 text-sm"
                    onClick={() => openExercisePanel(pkg.id)}
                  >
                    <Play size={14} className="mr-1" />
                    {t('exercise.startPackage')}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* 选择按钮 — 竖排 3 个，仅选中态高亮 */}
      <div className="flex flex-col justify-center gap-3">
        {exercisePackages.map((pkg, i) => {
          const letter = pkg.name.charAt(0);
          return (
            <button
              key={pkg.id}
              onClick={() => setSelectedIndex(i)}
              className={`flex size-11 items-center justify-center rounded-xl text-sm font-bold transition-colors duration-200 ${
                i === selectedIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              title={pkg.name}
            >
              {letter}
            </button>
          );
        })}
      </div>
    </div>
  );
}