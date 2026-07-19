import type { ReactNode } from 'react';
import { CircularProgressbar } from 'react-circular-progressbar';
import { cn } from '@/lib/utils';

interface CircularProgressProps {
  size: number;
  strokeWidth: number;
  progress: number;
  className?: string;
  children?: ReactNode;
  color?: string;
}

export function CircularProgress({ size, strokeWidth, progress, className, children, color }: CircularProgressProps) {
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <CircularProgressbar
        value={progress * 100}
        strokeWidth={strokeWidth * 100 / size}
        styles={{
          root: { width: size, height: size },
          path: {
            stroke: color || 'var(--action-primary)',
            strokeLinecap: 'round',
            transition: 'stroke-dashoffset 0.5s linear',
          },
          trail: {
            stroke: 'rgba(255,255,255,0.12)',
          },
        }}
      />
      {children && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          {children}
        </div>
      )}
    </div>
  );
}
