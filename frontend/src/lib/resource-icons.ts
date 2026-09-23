import {
  Archive, Award, Bell, Book, BookOpen, Bookmark, Box, Calendar, Code, Cpu, Database, ExternalLink,
  FileText, Folder, Gamepad, Gift, Heart, HelpCircle, Home, Image, Info,
  Globe, GraduationCap, Link, LogIn, LogOut, Mail, Map, MessageSquare, Monitor, Music, Music2, Package,
  Palette, Puzzle, Radio, Search, Server, Settings, Shield, ShoppingCart,
  Smartphone, Star, Tag, TrendingUp, User, Users, Video, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';

/** A small, statically imported set for navigation and resource category icons. */
export const NAVIGATION_ICON_REGISTRY = {
  Home, Search, Folder, Tag, Users, MessageSquare, Bell, Settings, Shield,
  Book, FileText, Image, Video, Music, Calendar, Map, Star, Heart,
  TrendingUp, ExternalLink, Link, HelpCircle, Info, Mail, ShoppingCart,
  Gift, Award, User, LogIn, LogOut, Package, Puzzle, Server, Radio,
  Code, Gamepad, Monitor, Smartphone, Palette, BookOpen, Wrench, Box, Archive,
  Zap, Globe, Database, Cpu, Music2, GraduationCap,
} satisfies Record<string, LucideIcon>;

export type NavigationIconName = keyof typeof NAVIGATION_ICON_REGISTRY;

/** Keep the admin picker constrained to icons the renderer can always resolve. */
export const ICON_WHITELIST = [
  'Wrench', 'Map', 'FileText', 'Image', 'Video', 'Music', 'Code', 'Package',
  'Box', 'Folder', 'Archive', 'Zap', 'Globe', 'Database', 'Cpu', 'Smartphone',
  'Monitor', 'Gamepad', 'Book', 'BookOpen', 'GraduationCap', 'Palette', 'Music2',
  'Puzzle', 'Server',
] as const;

export function getIconComponent(iconName?: string | null): LucideIcon {
  if (iconName && Object.prototype.hasOwnProperty.call(NAVIGATION_ICON_REGISTRY, iconName)) {
    return NAVIGATION_ICON_REGISTRY[iconName as NavigationIconName];
  }
  return Folder;
}
