import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHealthStore } from '@/store';
import { exercisePackages, exercises } from '@/data/exercises';
import { PackageBackdrop } from './PackageBackdrop';
import { ExerciseTagCloud } from './ExerciseTagCloud';
import { PackageChip } from './PackageChip';

export function PackageHero() {
  const { t } = useTranslation();
  const [hoveredPackageId, setHoveredPackageId] = useState<string | null>(null);
  const openExercisePanel = useHealthStore((s) => s.openExercisePanel);
  const packageItemWidth = 'calc(2 * var(--grid-col) + var(--grid-gap))';

  return (
    <div className="relative h-[270px] shrink-0 rounded-[18px]">
      <div className="absolute inset-0 overflow-hidden rounded-[18px]">
        <div className="absolute inset-0 z-0">
          <ExerciseTagCloud
            exercises={exercises}
            packages={exercisePackages}
            currentPackageId={hoveredPackageId}
          />
          <PackageBackdrop />
        </div>
      </div>

      <h2 className="absolute top-0 left-0 z-20 text-type-card-title font-semibold text-foreground drop-shadow-sm">
        {t('exercise.packages')}
      </h2>

      <div
        className={[
          'pointer-events-none absolute left-0 z-20 rounded-md bg-card/75 p-2 transition-opacity duration-200',
          hoveredPackageId ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        style={{ bottom: '68px', width: 'var(--grid-content)' }}
      >
        <p className="line-clamp-2 text-type-caption leading-tight text-muted-foreground">
          {exercisePackages.find((p) => p.id === hoveredPackageId)?.description ?? ''}
        </p>
      </div>

      <div
        className="absolute bottom-0 left-0 z-20 h-[90px]"
        style={{ width: 'var(--grid-content)' }}
      >
        <div className="flex h-full items-end gap-3">
          {exercisePackages.map((pkg) => (
            <div key={pkg.id} className="shrink-0" style={{ width: packageItemWidth }}>
              <PackageChip
                pkg={pkg}
                onStart={openExercisePanel}
                onHover={() => setHoveredPackageId(pkg.id)}
                onLeave={() => setHoveredPackageId(null)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
