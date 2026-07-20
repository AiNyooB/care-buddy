/**
 * recommend.test.ts — 按时间段推荐运动套餐
 *
 * 上午 06:00–11:59 → package-quick
 * 下午 12:00–17:59 → package-standard
 * 其余（夜间/凌晨）→ package-deep
 *
 * 用固定小时构造 Date，避免依赖真实时钟。
 */

import { describe, expect, it } from 'vitest';
import { getRecommendedPackageId } from '@/utils/recommend';

// 以本地时区构造固定小时（new Date(y,m,d,h) 的小时即本地小时）
function at(hour: number): Date {
  return new Date(2026, 0, 1, hour, 30, 0);
}

describe('getRecommendedPackageId - 上午', () => {
  it('边界 06 与 11 都属于上午 → quick', () => {
    expect(getRecommendedPackageId(at(6))).toBe('package-quick');
    expect(getRecommendedPackageId(at(9))).toBe('package-quick');
    expect(getRecommendedPackageId(at(11))).toBe('package-quick');
  });
});

describe('getRecommendedPackageId - 下午', () => {
  it('边界 12 与 17 都属于下午 → standard', () => {
    expect(getRecommendedPackageId(at(12))).toBe('package-standard');
    expect(getRecommendedPackageId(at(13))).toBe('package-standard');
    expect(getRecommendedPackageId(at(17))).toBe('package-standard');
  });
});

describe('getRecommendedPackageId - 其余时段', () => {
  it('凌晨与夜间 → deep', () => {
    expect(getRecommendedPackageId(at(0))).toBe('package-deep');
    expect(getRecommendedPackageId(at(5))).toBe('package-deep');
    expect(getRecommendedPackageId(at(18))).toBe('package-deep');
    expect(getRecommendedPackageId(at(23))).toBe('package-deep');
  });
});
