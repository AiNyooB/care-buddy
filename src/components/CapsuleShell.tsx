import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AnimatePresence, motion } from 'motion/react';
import { FloatingPreview } from './FloatingPreview';
import { EntertainmentPreview } from './EntertainmentPreview';

export function CapsuleShell() {
  const [mode, setMode] = useState<'floating' | 'entertainment'>('floating');

  useEffect(() => {
    document.documentElement.classList.add('floating-mode');
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    document.body.style.background = 'transparent';

    return () => {
      document.documentElement.classList.remove('floating-mode');
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
      document.body.style.background = '';
    };
  }, []);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    listen<{ active: boolean }>('entertainment-mode-changed', (event) => {
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="h-full w-full"
          >
            <FloatingPreview />
          </motion.div>
        ) : (
          <motion.div
            key="entertainment"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="h-full w-full"
          >
            <EntertainmentPreview />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
