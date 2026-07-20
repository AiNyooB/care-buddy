import { useEffect } from 'react';
import { useHealthStore } from '@/store';
import { onSettingsUpdate } from '@/services';
import type { AppSettings } from '@/types';

/**
 * AppSettings key 白名单：后端通过 settings-updated 事件推送的字段只允许这些 key 落地 store。
 * 防止后端误推或恶意构造字段污染 store。
 */
const ALLOWED_SETTING_KEYS: ReadonlyArray<keyof AppSettings> = [
  'lockScreenExerciseEnabled',
  'strictMode',
  'autoUnlock',
  'autoResetOnIdle',
  'allowStrictSnooze',
  'mergeThreshold',
  'idleThreshold',
  'maxSnoozeCount',
  'soundEnabled',
  'customSoundPath',
  'autoStart',
  'silentAutoStart',
  'floatingWindowEnabled',
  'floatingMode',
  'floatingTheme',
  'customBgImagePath',
  'theme',
  'locale',
  'appMode',
  'floatingDisplayStrategy',
  'showRecommendation',
  'entertainmentModeEnabled',
  'floatingOpacity',
  'floatingSnoozeMinutes',
  'entertainmentOpacity',
  'entertainmentSnoozeMinutes',
  'entertainmentApps',
  'entertainmentIdleThreshold',
  'entertainmentReminderMinutes',
  'entertainmentExitThreshold',
  'entertainmentMountRecoverySeconds',
];

export function useSettingsSync() {
  useEffect(() => {
    const unlisten = onSettingsUpdate((incoming) => {
      const partial: Partial<AppSettings> = {};
      const record = incoming as Record<string, unknown>;
      for (const key of ALLOWED_SETTING_KEYS) {
        if (key in record) {
          // 类型断言安全：key 已通过白名单校验，incoming 来自后端 settings-updated 事件
          (partial as Record<string, unknown>)[key] = record[key];
        }
      }
      if (Object.keys(partial).length > 0) {
        useHealthStore.getState().updateSettings(partial);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);
}
