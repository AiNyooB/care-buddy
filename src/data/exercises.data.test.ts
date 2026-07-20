/**
 * exercises 数据完整性测试
 *
 * 验证运动库与套餐引用的内部一致性：ID 唯一、必填字段完整、
 * 分类合法、套餐引用的运动都存在。与 exercise.test.ts（按函数行为）互补，
 * 本文件只校验数据结构，不重复测试 getExerciseById 等导出函数。
 */

import { describe, expect, it } from 'vitest';
import { exercises, exercisePackages } from '@/data/exercises';

const VALID_CATEGORIES = ['spine', 'circulation', 'metabolism', 'vision', 'wrist'];

const REQUIRED_STRING_FIELDS = [
  'id',
  'name',
  'category',
  'priority',
  'description',
  'instructions',
  'duration',
  'targetArea',
  'whyImportant',
] as const;

describe('exercises - 基础完整性', () => {
  it('运动库非空', () => {
    expect(exercises.length).toBeGreaterThan(0);
  });

  it('所有运动 ID 唯一', () => {
    const ids = exercises.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个运动必填字段均为非空字符串', () => {
    for (const ex of exercises) {
      for (const field of REQUIRED_STRING_FIELDS) {
        const value = (ex as Record<string, unknown>)[field];
        expect(typeof value).toBe('string');
        expect((value as string).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('类别为合法枚举值', () => {
    for (const ex of exercises) {
      expect(VALID_CATEGORIES).toContain(ex.category);
    }
  });

  it('数值字段（repetitions/holdTime/sets）均为正数或缺失', () => {
    for (const ex of exercises) {
      // 注意：exercise 的 duration 是字符串（如 '约1分钟'），不在此校验
      const numericFields: (keyof typeof ex)[] = ['repetitions', 'holdTime', 'sets'];
      for (const f of numericFields) {
        const v = ex[f];
        if (v !== undefined && v !== null) {
          expect(typeof v).toBe('number');
          expect(v as number).toBeGreaterThan(0);
        }
      }
    }
  });

  it('boolean 字段类型正确（若存在）', () => {
    for (const ex of exercises) {
      if (ex.requiresStanding !== undefined) {
        expect(typeof ex.requiresStanding).toBe('boolean');
      }
      if (ex.spaceRequired !== undefined) {
        expect(typeof ex.spaceRequired).toBe('boolean');
      }
    }
  });
});

describe('exercisePackages - 引用完整性', () => {
  it('套餐非空', () => {
    expect(exercisePackages.length).toBeGreaterThan(0);
  });

  it('每个套餐引用的 exerciseId 均存在于运动库', () => {
    const validIds = new Set(exercises.map((e) => e.id));
    for (const pkg of exercisePackages) {
      expect(Array.isArray(pkg.exercises)).toBe(true);
      expect(pkg.exercises.length).toBeGreaterThan(0);
      for (const item of pkg.exercises) {
        expect(validIds.has(item.exerciseId)).toBe(true);
      }
    }
  });

  it('套餐 id 唯一', () => {
    const ids = exercisePackages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
