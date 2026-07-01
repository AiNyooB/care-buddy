import { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Clock } from 'lucide-react';
import { TaskIcon } from './Icons';

interface PreviewPayload {
  taskId: string;
  title: string;
  icon: string;
  remaining: number;
  preNotificationSeconds: number;
  otherCount: number;
}

function TaskProgress({ remaining, total }: { remaining: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10">
      <div
        className="h-full rounded-full bg-white/40 transition-[width] duration-500 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function useSpringValue(target: number, config?: { tension?: number; damping?: number }) {
  const { tension = 0.08, damping = 0.6 } = config ?? {};
  const val = useRef(target);
  const vel = useRef(0);
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    let raf: number;
    const step = () => {
      const dx = target - val.current;
      vel.current += dx * tension;
      vel.current *= damping;
      val.current += vel.current;
      setDisplay(Math.round(val.current * 100) / 100);
      if (Math.abs(dx) > 0.01 || Math.abs(vel.current) > 0.01) {
        raf = requestAnimationFrame(step);
      } else {
        setDisplay(target);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, tension, damping]);

  return display;
}

function useEntranceAnimation() {
  const [scale, setScale] = useState(0.85);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 500;
    let raf: number;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // Spring-ish easing: cubic bezier approximation
      const s = 1 - Math.cos(2 * Math.PI * 2.0 * t) * Math.exp(-10.5 * t);
      setScale(0.85 + (1 - 0.85) * Math.min(1, t * 2.5));
      setOpacity(Math.min(1, t * 4));
      if (t < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { scale, opacity };
}

export function FloatingPreview() {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const { scale, opacity } = useEntranceAnimation();
  const springRemaining = useSpringValue(preview?.remaining ?? 0);

  // 浮窗模式下设置 html/body 透明背景，防止 WebView2 默认白色背景露出
  useEffect(() => {
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    document.body.style.background = 'transparent';

    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
      document.body.style.background = '';
    };
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    listen<PreviewPayload>('floating-preview-update', (event) => {
      setPreview(event.payload);
    }).then((f) => { cleanup = f; });
    return () => { cleanup?.(); };
  }, []);

  const hasData = preview !== null;
  const pct = preview
    ? Math.max(0, Math.min(100, (preview.remaining / Math.max(preview.preNotificationSeconds, 1)) * 100))
    : 0;

  return (
    <div
      className="relative flex h-screen w-screen items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 px-5 shadow-2xl ring-1 ring-white/5"
      style={{ opacity, transform: `scale(${scale})` }}
    >
      {/* 调试标识 */}
      <div className="absolute right-2 top-1.5 flex h-3.5 items-center rounded bg-white/15 px-1">
        <span className="text-[8px] font-semibold uppercase tracking-wider text-white/50">dev</span>
      </div>
      {/* 进度条 */}
      {hasData && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-white/50 to-white/30 transition-[width] duration-500 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* 图标 */}
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/10">
        {hasData ? <TaskIcon icon={preview.icon} size={17} /> : <Clock size={17} className="text-white/50" />}
      </div>

      {/* 文字 */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium leading-tight text-white/90">
          {hasData ? preview.title : '—'}
        </span>
        <span className="text-[11px] leading-tight tracking-wide text-white/50">
          {hasData
            ? `即将提醒 · 剩余`
            : '等待任务'}
        </span>
        {hasData && preview.otherCount > 0 && (
          <span className="text-[10px] leading-tight text-white/30">
            +{preview.otherCount} 个待提醒
          </span>
        )}
      </div>

      {/* 倒计时数字 */}
      {hasData && (
        <div className="flex shrink-0 items-baseline gap-0.5">
          <span className="text-xl font-bold tabular-nums tracking-tight text-white">
            {Math.round(springRemaining)}
          </span>
          <span className="text-[10px] font-medium text-white/40">秒</span>
        </div>
      )}
    </div>
  );
}