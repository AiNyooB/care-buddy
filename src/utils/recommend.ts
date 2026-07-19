import type { PackageType } from '@/types';

/**
 * 按当前时间段推荐运动套餐。
 * 上午（06:00–11:59）→ quick；下午（12:00–17:59）→ standard；其余 → deep。
 */
export function getRecommendedPackageId(now: Date = new Date()): PackageType {
  const h = now.getHours();
  if (h >= 6 && h < 12) return 'package-quick';
  if (h >= 12 && h < 18) return 'package-standard';
  return 'package-deep';
}
