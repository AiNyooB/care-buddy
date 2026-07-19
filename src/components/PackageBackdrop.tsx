/**
 * PackageBackdrop — 形象展示（男女角色图）全宽背景层
 *
 * 行为：
 * - 覆盖整个套餐 Hero 区域，由外部 `gender` 受控（男/女切换）
 * - 切换时以 0.5s 淡入过渡，不再自动轮播
 */

import { motion } from 'motion/react';
import pose1 from '@/assets/hero/pose-1.png';
import pose2 from '@/assets/hero/pose-2.png';

export type CharacterGender = 'male' | 'female';

const GENDER_IMAGE: Record<CharacterGender, string> = {
  male: pose1,
  female: pose2,
};

type PackageBackdropProps = {
  gender: CharacterGender;
};

export function PackageBackdrop({ gender }: PackageBackdropProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[18px]"
      style={{
        maskImage: 'linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%)',
      }}
      aria-hidden
    >
      <motion.img
        key={gender}
        src={GENDER_IMAGE[gender]}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeIn' }}
        className="absolute inset-0 mx-auto h-full w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
