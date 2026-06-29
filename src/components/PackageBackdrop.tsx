/**
 * PackageBackdrop — 3D 蒙版图全宽背景层
 *
 * 行为：
 * - 覆盖整个套餐 Hero 区域
 * - 两张 3D 蒙版图 5 秒定时错峰淡入淡出（先出后进，无浑浊中点）
 * - 通过左右渐隐 mask 保持背景柔和，不抢右侧套餐轨道的视觉层级
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import pose1 from '@/assets/hero/pose-1.png';
import pose2 from '@/assets/hero/pose-2.png';

type Phase = 'show-a' | 'fade-out-a' | 'fade-in-b' | 'show-b' | 'fade-out-b' | 'fade-in-a';

const HOLD_MS = 3800;
const FADE_MS = 600;

const PHASE_DURATION: Record<Phase, number> = {
  'show-a': HOLD_MS,
  'fade-out-a': FADE_MS,
  'fade-in-b': FADE_MS,
  'show-b': HOLD_MS,
  'fade-out-b': FADE_MS,
  'fade-in-a': FADE_MS,
};

const NEXT_PHASE: Record<Phase, Phase> = {
  'show-a': 'fade-out-a',
  'fade-out-a': 'fade-in-b',
  'fade-in-b': 'show-b',
  'show-b': 'fade-out-b',
  'fade-out-b': 'fade-in-a',
  'fade-in-a': 'show-a',
};

export function PackageBackdrop() {
  const [phase, setPhase] = useState<Phase>('show-a');

  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase(NEXT_PHASE[phase]);
    }, PHASE_DURATION[phase]);
    return () => clearTimeout(timer);
  }, [phase]);

  const imgAOpacity = phase === 'show-a' || phase === 'fade-in-a' ? 1 : 0;
  const imgBOpacity = phase === 'show-b' || phase === 'fade-in-b' ? 1 : 0;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%)',
      }}
      aria-hidden
    >
      <motion.div className="relative h-full w-full">
        <motion.img
          src={pose1}
          alt=""
          initial={false}
          animate={{ opacity: imgAOpacity }}
          transition={{ duration: FADE_MS / 1000, ease: 'easeIn' }}
          className="absolute inset-0 mx-auto h-full w-full object-contain"
          draggable={false}
        />
        <motion.img
          src={pose2}
          alt=""
          initial={false}
          animate={{ opacity: imgBOpacity }}
          transition={{ duration: FADE_MS / 1000, ease: 'easeIn' }}
          className="absolute inset-0 mx-auto h-full w-full object-contain"
          draggable={false}
        />
      </motion.div>
    </div>
  );
}
