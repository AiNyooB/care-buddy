/**
 * ExerciseTagCloud — 运动名称文字云（Marquee 四行反向滚动）
 *
 * 行为：
 * - 四行跑马灯，方向交替（左、右、左、右），营造层次感
 * - 17 个并集运动名称随机排列（每行独立洗牌）
 * - 字号 text-sm（14px），整体不抢主视觉权重，仅作背景层次
 * - 颜色规则：text-muted-foreground + opacity-30（弱化背景感）
 * - 整个容器左右渐隐遮罩（fade edge）
 * - pointer-events-none，不阻挡主卡交互
 */

import Marquee from 'react-fast-marquee';
import { useMemo } from 'react';
import type { Exercise, ExercisePackage } from '@/types';
import { UNION_EXERCISE_IDS } from '@/data/packageTagCloudLayouts';

interface ExerciseTagCloudProps {
  /** 所有运动数据 */
  exercises: Exercise[];
  /** 所有套餐数据 */
  packages: ExercisePackage[];
  /** 当前选中套餐 ID（可能为 null） */
  currentPackageId?: string | null;
}

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ExerciseTagCloud({
  exercises,
  packages,
  currentPackageId,
}: ExerciseTagCloudProps) {
  const currentPkg = packages.find((p) => p.id === currentPackageId);
  const inCurrentSet = useMemo(
    () => new Set(currentPkg?.exercises.map((e) => e.exerciseId) ?? []),
    [currentPkg],
  );

  const rowShuffles = useMemo(() => {
    const items = UNION_EXERCISE_IDS.map(
      (id) => exercises.find((ex) => ex.id === id),
    ).filter((ex): ex is Exercise => ex !== undefined);
    return [shuffle(items), shuffle(items), shuffle(items), shuffle(items)];
  }, [exercises]);

  const renderItems = (row: number) =>
    rowShuffles[row].map((ex) => (
      <span
        key={`${row}-${ex.id}`}
        className={[
          'mx-4 select-none whitespace-nowrap text-sm font-medium leading-none transition-colors duration-300',
          currentPackageId
            ? inCurrentSet.has(ex.id)
              ? 'text-primary/45'
              : 'text-muted-foreground/20'
            : 'text-muted-foreground/30',
        ].join(' ')}
      >
        {ex.name}
      </span>
    ));

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 flex flex-col justify-center gap-3 overflow-hidden -translate-y-6"
      aria-hidden
      style={{
        maskImage: 'linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%)',
      }}
    >
      {/* 三行跑马灯，方向交替 + 速度递进 */}
      <Marquee speed={40} direction="left" gradient={false} pauseOnHover={false}>
        {renderItems(0)}
      </Marquee>
      <Marquee speed={28} direction="right" gradient={false} pauseOnHover={false}>
        {renderItems(1)}
      </Marquee>
      <Marquee speed={34} direction="left" gradient={false} pauseOnHover={false}>
        {renderItems(2)}
      </Marquee>
    </div>
  );
}
