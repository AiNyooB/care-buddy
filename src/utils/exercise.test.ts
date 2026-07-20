/**
 * src/utils/exercise.ts 单元测试
 *
 * 注意：getExerciseDuration 是非导出内部函数，通过 computeExerciseDuration 间接测试。
 */
import { describe, it, expect } from 'vitest';
import {
  computeExerciseDuration,
  aggregateExerciseIds,
  formatExerciseDuration,
} from './exercise';
import type { Task } from '@/types';

describe('computeExerciseDuration', () => {
  it('空数组返回 0', () => {
    expect(computeExerciseDuration([])).toBe(0);
  });

  it('undefined 返回 0', () => {
    expect(computeExerciseDuration(undefined)).toBe(0);
  });

  it('E-01 无 guidedConfig 走 FALLBACK_DURATION=30', () => {
    // E-01 在 guidedExerciseConfigs 中是空对象 {}
    expect(computeExerciseDuration(['E-01'])).toBe(30);
  });

  it('不存在的 ID 走 FALLBACK_DURATION=30', () => {
    expect(computeExerciseDuration(['E-NOT-EXIST'])).toBe(30);
  });

  it('E-02 已知配置应返回正数（间接验证 getExerciseDuration）', () => {
    // E-02: prepCountdown=3, cycle=[2,2] 共 4s × 15 reps = 60s + prep(3+0.7) + transitions
    // 期望 ≥ 60
    const r = computeExerciseDuration(['E-02']);
    expect(r).toBeGreaterThan(60);
  });

  it('多 ID 累加', () => {
    const single = computeExerciseDuration(['E-01']);
    const multi = computeExerciseDuration(['E-01', 'E-01']);
    expect(multi).toBe(single * 2);
  });
});

describe('aggregateExerciseIds', () => {
  const mkTask = (id: string, exerciseIds?: string[]): Task =>
    ({ id, exerciseIds } as unknown as Task);

  it('primary 在前，merged 去重', () => {
    const primary = mkTask('main', ['E-01', 'E-02']);
    const merged = [mkTask('m1', ['E-02', 'E-03']), mkTask('m2', ['E-04'])];
    expect(aggregateExerciseIds(primary, merged)).toEqual(['E-01', 'E-02', 'E-03', 'E-04']);
  });

  it('primary undefined exerciseIds', () => {
    const primary = mkTask('main', undefined);
    const merged = [mkTask('m1', ['E-01'])];
    expect(aggregateExerciseIds(primary, merged)).toEqual(['E-01']);
  });

  it('全部空返回 []', () => {
    const primary = mkTask('main', undefined);
    const merged = [mkTask('m1', undefined), mkTask('m2', [])];
    expect(aggregateExerciseIds(primary, merged)).toEqual([]);
  });

  it('merged 首次出现去重', () => {
    const primary = mkTask('main', []);
    const merged = [mkTask('m1', ['E-01', 'E-01']), mkTask('m2', ['E-01'])];
    expect(aggregateExerciseIds(primary, merged)).toEqual(['E-01']);
  });

  it('primary 与 merged 重复时 primary 顺序保留', () => {
    const primary = mkTask('main', ['E-02', 'E-01']);
    const merged = [mkTask('m1', ['E-01', 'E-02', 'E-03'])];
    // primary 在前：E-02, E-01；merged 去重后只剩 E-03
    expect(aggregateExerciseIds(primary, merged)).toEqual(['E-02', 'E-01', 'E-03']);
  });
});

describe('formatExerciseDuration', () => {
  it('0 或负数返回 ~0s', () => {
    expect(formatExerciseDuration(0)).toBe('~0s');
    expect(formatExerciseDuration(-1)).toBe('~0s');
  });

  it('≤ 60s 返回 ~Ns', () => {
    expect(formatExerciseDuration(1)).toBe('~1s');
    expect(formatExerciseDuration(30)).toBe('~30s');
    expect(formatExerciseDuration(60)).toBe('~60s');
  });

  it('60 < s 且整分钟返回 ~Nmin', () => {
    expect(formatExerciseDuration(120)).toBe('~2min');
    expect(formatExerciseDuration(300)).toBe('~5min');
  });

  it('非整分钟返回 1 位小数', () => {
    expect(formatExerciseDuration(90)).toBe('~1.5min');
    expect(formatExerciseDuration(150)).toBe('~2.5min');
  });

  it('四舍五入到整数秒', () => {
    expect(formatExerciseDuration(45.4)).toBe('~45s');
    expect(formatExerciseDuration(45.5)).toBe('~46s');
  });
});
