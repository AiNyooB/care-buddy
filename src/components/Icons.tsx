/**
 * SVG 图标组件（使用 lucide-react 替代内联 SVG）
 */
import {
  Clock,
  Eye,
  GlassWater,
  Play,
  Target,
  CheckCircle,
  Plus,
  XCircle,
  ChevronRight,
  Volume2,
  VolumeX,
  Pause,
  RotateCcw,
  Dumbbell,
  Trash2,
  X,
  PersonStanding,
  type LucideIcon,
  AudioWaveform,
  Gamepad2,
} from 'lucide-react';

export {
  Clock,
  Play,
  Target,
  CheckCircle,
  Plus,
  XCircle,
  ChevronRight,
  Volume2,
  VolumeX,
  Pause,
  RotateCcw,
  Dumbbell,
  Trash2,
  X,
  Eye,
  GlassWater,
  PersonStanding,
  AudioWaveform,
};

export function TaskIcon({ icon, size = 14 }: { icon: string; size?: number }): React.ReactElement {
  const IconMap: Record<string, LucideIcon> = {
    eye: Eye,
    water: GlassWater,
    work: Clock,
    exercise: Dumbbell,
    sit: PersonStanding,
    entertainment: Gamepad2,
  };
  const Icon = IconMap[icon] ?? Clock;
  return <Icon size={size} />;
}
