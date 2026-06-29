import { useTranslation } from 'react-i18next';
import { Minus, X, Settings2 } from 'lucide-react';
import { invoke } from '@/services';
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
        <DropdownMenuTrigger className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <Settings2 size={16} strokeWidth={1.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-fit">
          <DropdownMenuItem onClick={() => onOpenSettings?.('reminders')}>
            {t('settings.taskManagement', { defaultValue: '提醒管理' })}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenSettings?.('general')}>
            {t('settings.general', { defaultValue: '通用设置' })}
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