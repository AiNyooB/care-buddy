import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AnimatePresence, motion } from 'motion/react';
import { FloatingPreview } from './FloatingPreview';
import { EntertainmentPreview } from './EntertainmentPreview';
import { getEntertainmentActive, startFloatingResize, startEntertainmentResize } from '../services';

export function CapsuleShell() {
  const [mode, setMode] = useState<'floating' | 'entertainment'>('floating');

  useEffect(() => {
    document.documentElement.classList.add('floating-mode');
    return () => {
      document.documentElement.classList.remove('floating-mode');
    };
  }, []);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    // mount 时同步后端当前娱乐模式状态，避免事件在 listen 注册前已发出导致状态丢失
    getEntertainmentActive()
      .then((active) => setMode(active ? 'entertainment' : 'floating'))
      .catch(console.warn);

    listen<{ active: boolean }>('entertainment-mode-changed', async (event) => {
      if (event.payload.active) {
        await startEntertainmentResize(120, 40);
      } else {
        await startFloatingResize(156, 40);
      }
      setMode(event.payload.active ? 'entertainment' : 'floating');
    }).then((f) => cleanups.push(f));

    return () => cleanups.forEach((f) => f());
  }, []);

  return (
    <div className="h-full w-full">
      <AnimatePresence>
        {mode === 'floating' ? (
          <motion.div
            key="floating"
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.5 }}
            className="h-full w-full"
          >
            <FloatingPreview />
          </motion.div>
        ) : (
          <motion.div
            key="entertainment"
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.5 }}
            className="h-full w-full"
          >
            <EntertainmentPreview />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
