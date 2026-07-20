/**
 * guided-configs 数据完整性测试
 *
 * 验证引导锻炼配置与运动库双向一致：
 * - 每个配置键都是合法的运动 ID（无孤儿配置）
 * - 每个运动都有对应配置（无缺失）
 * - 含 cycle 的配置，其每个步骤文本非空且 duration > 0
 */

import { describe, expect, it } from 'vitest';
import { exercises } from '@/data/exercises';
import { guidedExerciseConfigs } from '@/data/guided-configs';

describe('guidedExerciseConfigs - 与运动库一致性', () => {
  it('配置键集合与运动 ID 集合完全相等', () => {
    const exerciseIds = new Set(exercises.map((e) => e.id));
    const configKeys = Object.keys(guidedExerciseConfigs);
    expect(configKeys.length).toBe(exerciseIds.size);
    for (const key of configKeys) {
      expect(exerciseIds.has(key)).toBe(true);
    }
  });

  it('每个配置的 cycle 步骤文本非空且时长 > 0', () => {
    for (const [exerciseId, config] of Object.entries(guidedExerciseConfigs)) {
      expect(config).toBeDefined();
      if (config.guidedConfig?.cycle) {
        const steps = config.guidedConfig.cycle;
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
          expect(typeof step.text).toBe('string');
          expect(step.text.trim().length).toBeGreaterThan(0);
          expect(typeof step.instruction).toBe('string');
          expect(step.instruction.trim().length).toBeGreaterThan(0);
          expect(typeof step.duration).toBe('number');
          expect(step.duration).toBeGreaterThan(0);
        }
      }
    }
  });

  it('prepCountdown（若存在）为正', () => {
    for (const config of Object.values(guidedExerciseConfigs)) {
      const prep = config.prepCountdown;
      if (prep !== undefined) {
        expect(prep).toBeGreaterThan(0);
      }
    }
  });
});
