import type { LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

const ICON_WHITELIST = [
  'Wrench', 'Map', 'FileText', 'Image', 'Video', 'Music',
  'Code', 'Package', 'Box', 'Folder', 'Archive', 'Zap',
  'Globe', 'Database', 'Cpu', 'Smartphone', 'Monitor',
  'Gamepad', 'Book', 'BookOpen', 'GraduationCap', 'Palette', 'Music2',
  'Puzzle', 'Server',
];

export function getIconComponent(iconName: string): LucideIcon {
  if (ICON_WHITELIST.includes(iconName)) {
    const icon = (LucideIcons as Record<string, unknown>)[iconName];
    if (typeof icon === 'function') {
      return icon as LucideIcon;
    }
  }
  return LucideIcons.Folder;
}
