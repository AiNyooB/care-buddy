import { useTranslation } from 'react-i18next';
import { Home, Dumbbell, FileBarChart, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ViewMode = 'main' | 'exercise' | 'stats' | 'settings';

interface SidebarProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  theme?: 'light' | 'dark' | 'system';
  onThemeChange?: () => void;
}

export function Sidebar({ viewMode, onViewChange }: SidebarProps) {
  const { t } = useTranslation();

  const navItems: { mode: ViewMode; icon: typeof Home; label: string }[] = [
    { mode: 'main', icon: Home, label: t('nav.main') },
    { mode: 'exercise', icon: Dumbbell, label: t('nav.exercise') },
    { mode: 'stats', icon: FileBarChart, label: t('nav.stats') },
    { mode: 'settings', icon: Settings, label: t('settings.title') },
  ];

  return (
    <nav className="flex h-screen w-[var(--sidebar-width)] shrink-0 flex-col items-center bg-sidebar pt-[22px]" data-tauri-drag-region>
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
        H
      </div>

      <div className="mt-12 flex flex-col items-center gap-7">
        {navItems.map(({ mode, icon: Icon, label }) => (
          <div key={mode} className="group relative w-9 overflow-visible">
            <Button
              variant="ghost"
              size="icon-lg"
              data-active={viewMode === mode}
              className="w-9 group-hover:bg-card group-hover:text-primary group-hover:shadow-sm data-[active=true]:bg-card data-[active=true]:text-primary data-[active=true]:shadow-sm"
              onClick={() => onViewChange(mode)}
            >
              <Icon size={22} strokeWidth={1.5} />
            </Button>
            <div className="pointer-events-none absolute left-0 top-0 z-50 hidden h-9 w-fit items-center gap-4 rounded-lg bg-card px-[10px] shadow-sm ring-0 group-hover:flex">
              <Icon size={22} strokeWidth={1.5} className="shrink-0 text-primary" />
              <span className="text-nowrap text-sm text-foreground">{label}</span>
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
