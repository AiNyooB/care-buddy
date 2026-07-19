import { useTranslation } from 'react-i18next';
import { Minus, X, Settings2 } from 'lucide-react';
import { invoke } from '@/services';

export function WindowControls({
  onOpenSettings,
  settingsOpen = false,
}: {
  onOpenSettings?: (initialTab?: string) => void;
  settingsOpen?: boolean;
}) {
  const { t } = useTranslation();

  const handleMinimize = async () => {
    await invoke('minimize_main_window');
  };

  const handleClose = async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await invoke('hide_main_window');
  };

  return (
    <div className="flex items-center" data-tauri-drag-region={false}>
      {/* 应用图标：设置（app 自己的） */}
      <button
        onClick={() => onOpenSettings?.(settingsOpen ? undefined : 'reminders')}
        data-active={settingsOpen}
        aria-label={t('settings.title', { defaultValue: '系统设置' })}
        title={t('settings.title', { defaultValue: '系统设置' })}
        className="ml-1.5 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-tab-active-bg data-[active=true]:text-foreground"
      >
        <Settings2 size={16} strokeWidth={1.5} />
      </button>

      {/* 分类边界：app ↔ system */}
      <div className="mx-1.5 h-6 w-px bg-border" />

      {/* 系统控件：最小化 */}
      <button
        onClick={handleMinimize}
        title={t('window.minimize', { defaultValue: '最小化' })}
        className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Minus size={14} strokeWidth={1.5} />
      </button>

      {/* 系统控件：关闭 */}
      <button
        onClick={handleClose}
        title={t('window.closeToTray', { defaultValue: '关闭到托盘' })}
        className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
