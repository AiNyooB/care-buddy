import { useTranslation } from 'react-i18next';
import type { ExercisePackage } from '@/types';
import { Card, CardContent } from '@/components/ui/card';

interface PackageChipProps {
  pkg: ExercisePackage;
  onStart: (pkgId: string) => void;
  onHover?: () => void;
  onLeave?: () => void;
}

export function PackageChip({ pkg, onStart, onHover, onLeave }: PackageChipProps) {
  const { t } = useTranslation();

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={pkg.name}
      onClick={() => onStart(pkg.id)}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onStart(pkg.id);
        }
      }}
      className="group h-full cursor-pointer rounded-[10px] border border-border bg-card/75 p-0 text-foreground shadow-none ring-0 outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary hover:bg-card hover:shadow-[0_8px_16px_-8px_rgba(0,0,0,0.2)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
    >
      <CardContent className="flex h-full flex-col gap-2 p-2">
        <div className="min-w-0">
          <h3 className="truncate text-type-card-title font-semibold text-foreground">{pkg.name}</h3>
          <p className="mt-1 text-type-caption text-muted-foreground">
            {pkg.duration}
            {t('time.minutes')} · {pkg.exercises.length}
            {t('exercise.repetitions')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
