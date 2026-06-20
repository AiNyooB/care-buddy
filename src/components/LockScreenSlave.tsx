/**
 * 全屏锁屏窗口组件
 * 在独立的 webview 窗口中运行，覆盖整个屏幕显示锁屏 UI。
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { formatDuration } from '../utils/time';
import { playCompleteSound, playCountSound } from '../utils/audio';
import {
  exitLockMode,
  timerSetLockScreenActive,
  snoozeLockScreen,
} from '../services';
import { CheckCircle, XCircle } from './Icons';
import { Button } from '@/components/ui/button';
import { CircularProgress } from './CircularProgress';

function getParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

function parseValidInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function LockScreenSlave() {
  const { t } = useTranslation();

  const title = getParam('title') ?? t('lock.title');
  const desc = getParam('desc') ?? '';
  const duration = parseValidInt(getParam('duration'), 60);
  const strictMode = getParam('strict_mode') === 'true';
  const allowStrictSnooze = getParam('allow_strict_snooze') === 'true';
  const maxSnoozeCount = parseValidInt(getParam('max_snooze_count'), 3);
  const snoozeMinutes = parseValidInt(getParam('snooze_minutes'), 5);
  const autoUnlock = getParam('auto_unlock') === 'true';
  const taskId = getParam('task_id') ?? '';
  const isExerciseMode = getParam('is_exercise_mode') === 'true';

  const [remaining, setRemaining] = useState(duration);
  const [confirmed, setConfirmed] = useState(false);
  const [snoozeCount, setSnoozeCount] = useState(0);
  const completionHandledRef = useRef(false);

  const progress = duration > 0 ? (duration - remaining) / duration : 0;

  const handleComplete = useCallback(async () => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;
    setConfirmed(true);
    playCompleteSound();
    try {
      await emit('lock-screen-completed', { completed: true });
    } catch (e) {
      console.error('emit lock-screen-completed failed:', e);
    }
    try {
      await timerSetLockScreenActive(false);
    } catch (e) {
      console.error('timerSetLockScreenActive failed:', e);
    }
    try {
      await exitLockMode();
    } catch (e) {
      console.error('exitLockMode failed:', e);
    }
  }, []);

  const handleSkip = useCallback(async () => {
    if (strictMode && !allowStrictSnooze) return;
    if (snoozeCount >= maxSnoozeCount) return;

    // 先 snooze 再退出锁屏，避免 timer_set_lock_screen_active(false) 时
    // 任务还未 snoozed 走 triggered 重置分支清零 snooze_count
    try {
      await snoozeLockScreen(taskId, snoozeMinutes);
    } catch (e) {
      console.error('snoozeLockScreen failed:', e);
    }
    try {
      await emit('lock-screen-completed', { completed: false });
    } catch (e) {
      console.error('emit lock-screen-completed failed:', e);
    }
    try {
      await timerSetLockScreenActive(false);
    } catch (e) {
      console.error('timerSetLockScreenActive failed:', e);
    }
    setSnoozeCount((c) => c + 1);
    try {
      await exitLockMode();
    } catch (e) {
      console.error('exitLockMode failed:', e);
    }
  }, [strictMode, allowStrictSnooze, snoozeCount, maxSnoozeCount, taskId, snoozeMinutes]);

  useEffect(() => {
    const win = getCurrentWindow();
    win.setFullscreen(true).catch(() => {});
    win.setAlwaysOnTop(true).catch(() => {});
  }, []);

  useEffect(() => {
    if (confirmed) return;

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [confirmed]);

  // autoUnlock：remaining 到 0 时自动完成
  useEffect(() => {
    if (remaining === 0 && autoUnlock && !confirmed) {
      handleComplete();
    }
  }, [remaining, autoUnlock, confirmed, handleComplete]);

  // 每秒提示音
  useEffect(() => {
    if (confirmed || remaining <= 0) return;
    if (remaining <= 3 && remaining > 0) {
      playCountSound();
    }
  }, [remaining, confirmed]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm animate-[lockFadeIn_0.3s_ease]">
      <div className="text-center animate-[lockScaleIn_0.35s_ease]">
        {/* 任务标题 */}
        <div className="text-2xl font-semibold text-white mb-2">{title}</div>
        {desc && <div className="text-base text-white/70 mb-8 max-w-[280px]">{desc}</div>}

        {/* 倒计时圆环 */}
        <div className="mx-auto mb-8 size-[200px]">
          <CircularProgress size={200} strokeWidth={8} progress={progress}>
            {confirmed ? (
              <CheckCircle size={48} className="text-success" />
            ) : (
              <span className="font-sans text-[2.5rem] font-bold leading-[50px] text-white">
                {formatDuration(remaining)}
              </span>
            )}
          </CircularProgress>
        </div>

        <div className="flex justify-center gap-3">
          {confirmed ? (
            <Button
              className="bg-success text-white hover:bg-success/80"
              onClick={() => handleComplete()}
            >
              <CheckCircle size={20} />
            </Button>
          ) : (
            <>
              <Button onClick={handleComplete}>
                <CheckCircle size={20} />
              </Button>

              {(!strictMode || allowStrictSnooze) && snoozeCount < maxSnoozeCount ? (
                <Button variant="secondary" onClick={handleSkip}>
                  <XCircle size={20} />
                </Button>
              ) : null}
            </>
          )}
        </div>

        {/* 严格模式提示 */}
        {strictMode && !allowStrictSnooze && (
          <div className="mt-4 text-white/50 text-sm">
            {t('lock.strictModeHint')}
          </div>
        )}
      </div>
    </div>
  );
}