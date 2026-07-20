/**
 * src/utils/storage.ts 单元测试
 *
 * 直接 spy globalThis.localStorage 方法。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetLocalStorage } from '@/test/setup';
import { getStorage, setStorage, removeStorage, clearStorage, STORAGE_KEYS } from './storage';

describe('storage utils', () => {
  beforeEach(() => {
    // 每个测试用例使用全新的 localStorage 存储
    __resetLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getStorage', () => {
    it('未设置返回默认值', () => {
      expect(getStorage('not_exist', { a: 1 })).toEqual({ a: 1 });
    });

    it('设置后返回存储值', () => {
      setStorage('foo', { a: 1 });
      expect(getStorage('foo', null)).toEqual({ a: 1 });
    });

    it('字符串默认值', () => {
      expect(getStorage('not_exist', 'default')).toBe('default');
    });

    it('数字默认值', () => {
      expect(getStorage('not_exist', 42)).toBe(42);
    });

    it('JSON 解析失败返回默认值并删除损坏数据', () => {
      // 直接写入非法 JSON
      localStorage.setItem('care_buddy_broken', '{invalid json');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const r = getStorage('broken', { fallback: true });
      expect(r).toEqual({ fallback: true });
      expect(warnSpy).toHaveBeenCalled();
      // 解析失败应删除损坏数据
      expect(localStorage.getItem('care_buddy_broken')).toBeNull();
    });

    it('key 加 care_buddy_ 前缀', () => {
      setStorage('foo', 1);
      expect(localStorage.getItem('care_buddy_foo')).toBe('1');
      expect(localStorage.getItem('foo')).toBeNull();
    });
  });

  describe('setStorage', () => {
    it('对象序列化为 JSON', () => {
      setStorage('obj', { a: 1, b: 'x' });
      expect(localStorage.getItem('care_buddy_obj')).toBe('{"a":1,"b":"x"}');
    });

    it('数组序列化', () => {
      setStorage('arr', [1, 2, 3]);
      expect(localStorage.getItem('care_buddy_arr')).toBe('[1,2,3]');
    });

    it('setItem 抛错时不抛出（warn）', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(() => setStorage('foo', 1)).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('removeStorage', () => {
    it('删除已存在的 key', () => {
      setStorage('foo', 1);
      removeStorage('foo');
      expect(getStorage('foo', null)).toBeNull();
    });

    it('删除不存在的 key 不抛错', () => {
      expect(() => removeStorage('not_exist')).not.toThrow();
    });
  });

  describe('clearStorage', () => {
    it('清空所有 care_buddy_ 前缀的 key', () => {
      setStorage('foo', 1);
      setStorage('bar', 2);
      // 模拟外部 key（非 care_buddy_ 前缀）
      localStorage.setItem('other_app_key', 'x');
      // polyfill 的数据存在闭包 Map 中，Object.keys 看不到；
      // mock Object.keys 返回全部 keys 模拟浏览器环境
      const realKeys = vi.spyOn(Object, 'keys');
      realKeys.mockImplementation((obj: unknown) => {
        if (obj === localStorage) {
          return ['care_buddy_foo', 'care_buddy_bar', 'other_app_key'] as never;
        }
        return (realKeys as unknown as { getMockImplementation: () => ((o: unknown) => string[]) | undefined }).getMockImplementation()?.(obj) as never;
      });
      clearStorage();
      expect(localStorage.getItem('care_buddy_foo')).toBeNull();
      expect(localStorage.getItem('care_buddy_bar')).toBeNull();
      // 非 care_buddy_ 前缀的 key 保留
      expect(localStorage.getItem('other_app_key')).toBe('x');
    });

    it('无 care_buddy_ key 时不抛错', () => {
      expect(() => clearStorage()).not.toThrow();
    });
  });

  describe('STORAGE_KEYS', () => {
    it('包含核心 key', () => {
      expect(STORAGE_KEYS.TASKS).toBe('tasks');
      expect(STORAGE_KEYS.SETTINGS).toBe('settings');
      expect(STORAGE_KEYS.STATS).toBe('stats');
      expect(STORAGE_KEYS.DAILY_STATS).toBe('daily_stats');
    });
  });
});
