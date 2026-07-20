/**
 * src/utils/statsRecorder.ts 单元测试
 *
 * 测试 500ms 幂等窗口行为。Phase 3 已改为 Map<string, number> 按 taskId 维度幂等。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recordTaskCompletion } from './statsRecorder';
import { eventCoordinator } from '@/services/eventCoordinator';
import { useHealthStore } from '@/store/healthStore';

describe('recordTaskCompletion', () => {
  let incrementSitSpy: ReturnType<typeof vi.spyOn>;
  let incrementWaterSpy: ReturnType<typeof vi.spyOn>;
  let incrementEyeSpy: ReturnType<typeof vi.spyOn>;
  let incrementCustomSpy: ReturnType<typeof vi.spyOn>;
  let updateDailyStatsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // 重置 eventCoordinator 单例状态
    eventCoordinator.lastRecordedTaskTime.clear();

    // spy store action，避免真实写入
    incrementSitSpy = vi.spyOn(useHealthStore.getState(), 'incrementSitBreaks').mockImplementation(() => {});
    incrementWaterSpy = vi.spyOn(useHealthStore.getState(), 'incrementWaterCups').mockImplementation(() => {});
    incrementEyeSpy = vi.spyOn(useHealthStore.getState(), 'incrementEyeCare').mockImplementation(() => {});
    incrementCustomSpy = vi.spyOn(useHealthStore.getState(), 'incrementCustomBreaks').mockImplementation(() => {});
    updateDailyStatsSpy = vi.spyOn(useHealthStore.getState(), 'updateDailyStats').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sit 任务 → incrementSitBreaks + updateDailyStats', () => {
    recordTaskCompletion('sit');
    expect(incrementSitSpy).toHaveBeenCalledTimes(1);
    expect(updateDailyStatsSpy).toHaveBeenCalledTimes(1);
  });

  it('water 任务 → incrementWaterCups', () => {
    recordTaskCompletion('water');
    expect(incrementWaterSpy).toHaveBeenCalledTimes(1);
  });

  it('eye 任务 → incrementEyeCare', () => {
    recordTaskCompletion('eye');
    expect(incrementEyeSpy).toHaveBeenCalledTimes(1);
  });

  it('未知任务 → incrementCustomBreaks', () => {
    recordTaskCompletion('exercise');
    expect(incrementCustomSpy).toHaveBeenCalledTimes(1);
  });

  it('500ms 内同任务重复调用只计数一次', () => {
    recordTaskCompletion('sit');
    recordTaskCompletion('sit');
    recordTaskCompletion('sit');
    expect(incrementSitSpy).toHaveBeenCalledTimes(1);
  });

  it('500ms 后同任务再次调用会重新计数', async () => {
    recordTaskCompletion('sit');
    // 等待 501ms
    await new Promise((r) => setTimeout(r, 510));
    recordTaskCompletion('sit');
    expect(incrementSitSpy).toHaveBeenCalledTimes(2);
  });

  // Phase 3 已修复：按 taskId 维度幂等，sit→sit→water→sit 第二个 sit 被吞
  it('500ms 内 sit→sit→water→sit：sit 计数 1 次，water 计数 1 次', () => {
    recordTaskCompletion('sit'); // 计数 sit
    recordTaskCompletion('sit'); // 被吞（500ms 内同任务）
    recordTaskCompletion('water'); // 计数 water（taskId 不同）
    recordTaskCompletion('sit'); // 被吞（500ms 内同任务，按 taskId 维度幂等）
    expect(incrementSitSpy).toHaveBeenCalledTimes(1);
    expect(incrementWaterSpy).toHaveBeenCalledTimes(1);
  });
});
