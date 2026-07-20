/**
 * EventCoordinator 单元测试
 *
 * EventCoordinator 是模块级单例，跨 hook 共享可变状态（Set / Map / Record）。
 * 每个用例前调用 clearAll() 复位，保证用例间互不污染。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { eventCoordinator } from '@/services/eventCoordinator';

beforeEach(() => {
  eventCoordinator.clearAll();
});

describe('EventCoordinator - 触发态自愈标记', () => {
  it('handledTriggers 可增删查', () => {
    expect(eventCoordinator.handledTriggers.has('sit')).toBe(false);
    eventCoordinator.handledTriggers.add('sit');
    expect(eventCoordinator.handledTriggers.has('sit')).toBe(true);
  });

  it('clearTriggerState 清空 handledTriggers / notifiedPre / triggerStreak', () => {
    eventCoordinator.handledTriggers.add('a');
    eventCoordinator.notifiedPre.add('b');
    eventCoordinator.triggerStreak['c'] = 2;

    eventCoordinator.clearTriggerState();

    expect(eventCoordinator.handledTriggers.size).toBe(0);
    expect(eventCoordinator.notifiedPre.size).toBe(0);
    expect(Object.keys(eventCoordinator.triggerStreak)).toHaveLength(0);
  });

  it('triggerStreak 按 taskId 累加计数', () => {
    eventCoordinator.triggerStreak['sit'] = 1;
    eventCoordinator.triggerStreak['sit'] += 1;
    expect(eventCoordinator.triggerStreak['sit']).toBe(2);
  });
});

describe('EventCoordinator - 浮窗 / 统计幂等', () => {
  it('floatingVisible 可切换，clearAll 复位为 false', () => {
    eventCoordinator.floatingVisible = true;
    expect(eventCoordinator.floatingVisible).toBe(true);
    eventCoordinator.clearAll();
    expect(eventCoordinator.floatingVisible).toBe(false);
  });

  it('notifiedPre 预通知去重集合', () => {
    eventCoordinator.notifiedPre.add('sit');
    eventCoordinator.notifiedPre.add('sit'); // 重复添加不增长
    expect(eventCoordinator.notifiedPre.has('sit')).toBe(true);
    expect(eventCoordinator.notifiedPre.size).toBe(1);
  });

  it('lastRecordedTaskTime 记录上次时间戳，clearAll 清空', () => {
    eventCoordinator.lastRecordedTaskTime.set('sit', 12345);
    expect(eventCoordinator.lastRecordedTaskTime.get('sit')).toBe(12345);
    eventCoordinator.clearAll();
    expect(eventCoordinator.lastRecordedTaskTime.size).toBe(0);
  });
});
