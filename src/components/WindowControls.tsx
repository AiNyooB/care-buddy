import { useTranslation } from 'react-i18next';
import { ChevronDown, Minus, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';

export function WindowControls() {
  const { t } = useTranslation();

  const handleMinimize = async () => {
    await invoke('minimize_main_window');
  };

  const handleClose = async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await invoke('hide_main_window');
  };

  const handleCollapse = async () => {
    // TODO: 实现折叠功能（如浮动窗口）
    console.log('Collapse window');
  };

  return (
    <div className="flex items-center gap-6" data-tauri-drag-region={false}>
      <Button variant="ghost" size="icon" onClick={handleCollapse} title={t('window.collapse')}>
        <ChevronDown size={24} strokeWidth={1.5} />
      </Button>
      <Button variant="ghost" size="icon" onClick={handleMinimize} title={t('window.minimize')}>
        <Minus size={24} strokeWidth={1.5} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleClose}
        title={t('window.closeToTray')}
        className="hover:bg-destructive hover:text-destructive-foreground"
      >
        <X size={24} strokeWidth={1.5} />
      </Button>
    </div>
  );
}
