import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Clock, GlassWater, Eye } from 'lucide-react';

interface PreviewPayload {
  taskId: string;
  title: string;
  icon: string;
  remaining: number;
  preNotificationSeconds: number;
}

function TaskIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'eye': return <Eye size={16} />;
    case 'water': return <GlassWater size={16} />;
    default: return <Clock size={16} />;
  }
}

export function FloatingPreview() {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    listen<PreviewPayload>('floating-preview-update', (event) => {
      setPreview(event.payload);
    }).then((f) => { cleanup = f; });
    return () => { cleanup?.(); };
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-b from-black/60 to-black/80 px-4">
      <div className="flex w-full items-center justify-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-white/15 text-white">
          {preview ? <TaskIcon icon={preview.icon} /> : <Clock size={16} />}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium leading-tight text-white">
            {preview?.title ?? '准备中'}
          </span>
          <span className="text-[11px] leading-tight text-white/60">
            {preview ? `剩余 ${preview.remaining} 秒` : ''}
          </span>
        </div>
        {preview && (
          <span className="text-lg font-bold tabular-nums text-white">
            {preview.remaining}
          </span>
        )}
      </div>
    </div>
  );
}
