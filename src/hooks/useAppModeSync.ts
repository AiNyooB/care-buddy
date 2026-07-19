import { useEffect } from 'react';
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
 */
export function useAppModeSync() {
  const setAppMode = useHealthStore((s) => s.setAppMode);
  const updateSettings = useHealthStore((s) => s.updateSettings);
  const setEntertainmentActive = useHealthStore((s) => s.setEntertainmentActive);

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

    let cleanupMode: (() => void) | null = null;
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
      cleanupMode = fn;
    });

    let cleanupSettings: (() => void) | null = null;
    onSettingsUpdate((settings) => {
      const mode = settings.appMode as AppMode | undefined;
      if (mode && mode !== useHealthStore.getState().appMode) {
        setAppMode(mode);
        updateSettings({ appMode: mode });
      }
    }).then((fn) => {
      cleanupSettings = fn;
    });

    // 监听娱乐模式激活/退出事件
    let cleanupEntertainment: (() => void) | null = null;
    listen<{ active: boolean }>('entertainment-mode-changed', (event) => {
      setEntertainmentActive(event.payload.active);
    }).then((unlisten) => {
      cleanupEntertainment = unlisten;
    });

    return () => {
      cleanupMode?.();
      cleanupSettings?.();
      cleanupEntertainment?.();
    };
  }, [setAppMode, updateSettings, setEntertainmentActive]);
}
