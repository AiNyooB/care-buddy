import { useEffect, useRef } from 'react';
import { useHealthStore } from '@/store';
import { getAppMode, getEntertainmentActive, onAppModeUpdate, onSettingsUpdate } from '@/services';
import { listen } from '@tauri-apps/api/event';
import type { AppMode, FloatingDisplayStrategy } from '@/types';

/**
 * 同步前后端应用模式状态。
 * - 初始化时拉取 Rust 端当前模式，若与 Store 不一致则更新 Store。
 * - 监听 Rust 广播的 app-mode-changed（自动检测前台应用/其它窗口切换），同步到 Store。
 * - 监听 entertainment-mode-changed（娱乐模式激活/退出），同步到 Store。
 * - 监听 settings-updated，如果设置里的 appMode 变化也同步到 Store。
 *
 * cleanup 用 useRef 存储以避免 unmount 发生在 .then 之前时闭包变量为 null 的时序问题。
 */
export function useAppModeSync() {
  const setAppMode = useHealthStore((s) => s.setAppMode);
  const updateSettings = useHealthStore((s) => s.updateSettings);
  const setEntertainmentActive = useHealthStore((s) => s.setEntertainmentActive);
  const cleanupModeRef = useRef<(() => void) | null>(null);
  const cleanupSettingsRef = useRef<(() => void) | null>(null);
  const cleanupEntertainmentRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getAppMode()
      .then((mode) => {
        if (mode && mode !== useHealthStore.getState().appMode) {
          setAppMode(mode);
          updateSettings({ appMode: mode });
        }
      })
      .catch(console.warn);

    getEntertainmentActive()
      .then((active) => {
        if (active !== useHealthStore.getState().entertainmentActive) {
          setEntertainmentActive(active);
        }
      })
      .catch(console.warn);

    onAppModeUpdate((payload) => {
      const { mode, displayStrategy } = payload;
      if (mode !== useHealthStore.getState().appMode) {
        setAppMode(mode);
        updateSettings({ appMode: mode });
      }
      if (displayStrategy && displayStrategy !== useHealthStore.getState().settings.floatingDisplayStrategy) {
        updateSettings({ floatingDisplayStrategy: displayStrategy as FloatingDisplayStrategy });
      }
    }).then((fn) => {
      cleanupModeRef.current = fn;
    });

    onSettingsUpdate((settings) => {
      const mode = settings.appMode as AppMode | undefined;
      if (mode && mode !== useHealthStore.getState().appMode) {
        setAppMode(mode);
        updateSettings({ appMode: mode });
      }
    }).then((fn) => {
      cleanupSettingsRef.current = fn;
    });

    // 监听娱乐模式激活/退出事件
    listen<{ active: boolean }>('entertainment-mode-changed', (event) => {
      setEntertainmentActive(event.payload.active);
    }).then((unlisten) => {
      cleanupEntertainmentRef.current = unlisten;
    });

    return () => {
      cleanupModeRef.current?.();
      cleanupSettingsRef.current?.();
      cleanupEntertainmentRef.current?.();
    };
  }, [setAppMode, updateSettings, setEntertainmentActive]);
}
