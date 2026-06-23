import { useTranslation } from 'react-i18next';
import { Minus, X, Settings2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function WindowControls({ onOpenSettings }: { onOpenSettings?: (initialTab?: string) => void }) {
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
      {/* 设置按钮 */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex">
          <Button variant="ghost" size="icon" tabIndex={-1}>
            <Settings2 size={16} strokeWidth={1.5} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onOpenSettings?.('reminders')}>
            {t('settings.addReminder', { defaultValue: '添加新提醒' })}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenSettings?.('advanced')}>
            {t('settings.advanced', { defaultValue: '高级设置' })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 分割线 */}
      <div className="mx-1.5 h-6 w-px bg-border" />

      {/* 窗口按钮组 */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMinimize}
          title={t('window.minimize', { defaultValue: '最小化' })}
        >
          <Minus size={16} strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          title={t('window.closeToTray', { defaultValue: '关闭到托盘' })}
        >
          <X size={16} strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}