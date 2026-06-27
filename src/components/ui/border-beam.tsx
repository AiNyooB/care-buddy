import { cn } from '@/lib/utils';
import { type CSSProperties } from 'react';

interface BorderBeamProps {
  className?: string;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  spring?: boolean;
}

export function BorderBeam({
  className,
  duration = 4,
  colorFrom = '#22c55e',
  colorTo = '#3b82f6',
  spring = true,
}: BorderBeamProps) {
  return (
    <div
      style={
        {
          '--duration': `${duration}s`,
          '--color-from': colorFrom,
          '--color-to': colorTo,
          WebkitMaskImage: 'linear-gradient(#fff,#fff),linear-gradient(#fff,#fff)',
          WebkitMaskClip: 'padding-box,border-box',
          WebkitMaskComposite: 'xor',
          maskImage: 'linear-gradient(#fff,#fff),linear-gradient(#fff,#fff)',
          maskClip: 'padding-box,border-box',
          maskComposite: 'exclude',
        } as CSSProperties
      }
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit]',
        'z-0 border-[1.5px] border-transparent',
        className
      )}
      aria-hidden="true"
    >
      {/* 旋转的渐变层 */}
      <div
        className="absolute -top-1/2 -left-1/2 h-[200%] w-[200%]"
        style={{
          background: `conic-gradient(from 0deg, transparent 35%, var(--color-from) 40%, var(--color-to) 46%, transparent 51%)`,
          animation: `spin var(--duration) ${spring ? 'cubic-bezier(0.34, 1.56, 0.64, 1)' : 'linear'} infinite`,
        }}
      />
    </div>
  );
}