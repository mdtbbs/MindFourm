'use client';

import { useState } from 'react';
import Button from '@/components/ui/button';
import {
  Home, Search, Folder, Tag, Users, MessageSquare, Bell,
  Settings, Shield, Book, FileText, Image, Video, Music,
  Calendar, Map, Star, Heart, TrendingUp, ExternalLink,
  Link, HelpCircle, Info, Mail, ShoppingCart, Gift, Award,
  User, LogIn, LogOut,
  ArrowUp, ArrowDown, Trash2, Plus,
  type LucideIcon,
} from 'lucide-react';

export const SIDEBAR_ICON_OPTIONS = [
  'Home', 'Search', 'Folder', 'Tag', 'Users', 'MessageSquare', 'Bell',
  'Settings', 'Shield', 'Book', 'FileText', 'Image', 'Video', 'Music',
  'Calendar', 'Map', 'Star', 'Heart', 'TrendingUp', 'ExternalLink',
  'Link', 'HelpCircle', 'Info', 'Mail', 'ShoppingCart', 'Gift', 'Award',
  'User', 'LogIn', 'LogOut',
] as const;

const ICON_COMPONENTS: Record<string, LucideIcon> = {
  Home, Search, Folder, Tag, Users, MessageSquare, Bell,
  Settings, Shield, Book, FileText, Image, Video, Music,
  Calendar, Map, Star, Heart, TrendingUp, ExternalLink,
  Link, HelpCircle, Info, Mail, ShoppingCart, Gift, Award,
  User, LogIn, LogOut,
};

export interface SidebarNavigationItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  enabled: boolean;
  requiresAuth: boolean;
}

interface NavigationEditorProps {
  initialItems: SidebarNavigationItem[];
  onSave: (items: SidebarNavigationItem[]) => Promise<void>;
}

export function NavigationEditor({ initialItems, onSave }: NavigationEditorProps) {
  const [items, setItems] = useState<SidebarNavigationItem[]>(initialItems);
  const [saving, setSaving] = useState(false);

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setItems(next);
  }

  function moveDown(index: number) {
    if (index === items.length - 1) return;
    const next = [...items];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setItems(next);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function addItem() {
    const newItem: SidebarNavigationItem = {
      id: `item-${Date.now()}`,
      label: '',
      href: '',
      icon: 'Home',
      enabled: true,
      requiresAuth: false,
    };
    setItems([...items, newItem]);
  }

  function updateItem(index: number, updates: Partial<SidebarNavigationItem>) {
    const next = [...items];
    next[index] = { ...next[index], ...updates };
    setItems(next);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(items);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <div className="border border-dashed border-surface-200 bg-surface-50 px-4 py-6 text-sm text-surface-500">
          暂无导航项目，点击下方「添加项目」按钮开始配置。
        </div>
      )}

      {items.map((item, index) => {
        const IconComponent = ICON_COMPONENTS[item.icon] ?? Home;
        return (
          <div
            key={item.id}
            className={`border bg-white p-4 ${
              item.enabled ? 'border-surface-200' : 'border-surface-200 opacity-60'
            }`}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">
                  标签
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
                  value={item.label}
                  onChange={(e) => updateItem(index, { label: e.target.value })}
                  placeholder="首页"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">
                  链接
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-surface-200 rounded text-sm font-mono focus:outline-none focus:border-surface-400"
                  value={item.href}
                  onChange={(e) => updateItem(index, { href: e.target.value })}
                  placeholder="/"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">
                  图标
                </label>
                <div className="flex items-center gap-2">
                  <select
                    className="flex-1 px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
                    value={item.icon}
                    onChange={(e) => updateItem(index, { icon: e.target.value })}
                  >
                    {SIDEBAR_ICON_OPTIONS.map((icon) => (
                      <option key={icon} value={icon}>
                        {icon}
                      </option>
                    ))}
                  </select>
                  <IconComponent className="h-4 w-4 shrink-0 text-surface-500" />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) => updateItem(index, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-surface-900"
                  />
                  启用
                </label>

                <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.requiresAuth}
                    onChange={(e) => updateItem(index, { requiresAuth: e.target.checked })}
                    className="h-4 w-4 accent-surface-900"
                  />
                  需要登录
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => moveUp(index)}
                disabled={index === 0}
                title="上移"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => moveDown(index)}
                disabled={index === items.length - 1}
                title="下移"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                variant="destructive"
                size="icon-sm"
                onClick={() => removeItem(index)}
                title="删除"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex justify-between pt-2">
        <Button onClick={addItem} variant="outline">
          <Plus className="h-4 w-4 mr-1.5" />
          添加项目
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  );
}
