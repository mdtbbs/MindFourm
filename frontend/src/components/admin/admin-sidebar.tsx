'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { adminApi } from '@/lib/api/client';
import {
  LayoutDashboard, Settings, Megaphone, Palette, Search, FileText, Tag,
  AlertTriangle, FileCheck, Clock, Ban, Trash2, FolderTree, Users, ScrollText,
  Package, AlertCircle, FolderOpen, Puzzle, Award, Star, ShoppingBag, Flag
} from 'lucide-react';

const navSections = [
  {
    title: '概览',
    items: [
      { href: '/admin', label: '仪表盘', icon: LayoutDashboard, roles: ['admin', 'moderator'] },
    ],
  },
  {
    title: '站点',
    items: [
      { href: '/admin/settings/basic', label: '基本信息', icon: Settings, roles: ['admin'] },
      { href: '/admin/settings/announce', label: '公告管理', icon: Megaphone, roles: ['admin'] },
      { href: '/admin/settings/display', label: '显示设置', icon: Palette, roles: ['admin'] },
      { href: '/admin/settings/seo', label: 'SEO 设置', icon: Search, roles: ['admin'] },
    ],
  },
  {
    title: '内容',
    items: [
      { href: '/admin/posts', label: '帖子管理', icon: FileText, roles: ['admin', 'moderator'] },
      { href: '/admin/content/tags', label: '标签管理', icon: Tag, roles: ['admin'] },
      { href: '/admin/content/moderation', label: '审核队列', icon: AlertTriangle, roles: ['admin', 'moderator'] },
      { href: '/admin/content/reports', label: '举报处理', icon: Flag, roles: ['admin', 'moderator'] },
    ],
  },
  {
    title: '系统',
    items: [
      { href: '/admin/system/rules', label: '发帖规则', icon: FileCheck, roles: ['admin'] },
      { href: '/admin/system/rate-limits', label: '限流设置', icon: Clock, roles: ['admin'] },
      { href: '/admin/system/bans', label: '封禁管理', icon: Ban, roles: ['admin'] },
      { href: '/admin/system/cleanup', label: '数据清理', icon: Trash2, roles: ['admin'] },
    ],
  },
  {
    title: '管理',
    items: [
      { href: '/admin/categories', label: '分类管理', icon: FolderTree, roles: ['admin'] },
      { href: '/admin/users', label: '用户管理', icon: Users, roles: ['admin'] },
      { href: '/admin/logs', label: '系统日志', icon: ScrollText, roles: ['admin'] },
    ],
  },
  {
    title: '资源',
    items: [
      { href: '/admin/resources', label: '资源管理', icon: Package, roles: ['admin', 'moderator'] },
      { href: '/admin/resources/moderation', label: '资源审批', icon: AlertCircle, roles: ['admin', 'moderator'] },
      { href: '/admin/resource-categories', label: '类别管理', icon: FolderOpen, roles: ['admin'] },
    ],
  },
  {
    title: '扩展',
    items: [
      { href: '/admin/points', label: '积分规则', icon: Star, roles: ['admin'] },
      { href: '/admin/plugins', label: '插件管理', icon: Puzzle, roles: ['admin'] },
      { href: '/admin/levels', label: '等级管理', icon: Star, roles: ['admin'] },
      { href: '/admin/badges', label: '徽章管理', icon: Award, roles: ['admin'] },
      { href: '/admin/shop', label: '商城管理', icon: ShoppingBag, roles: ['admin'] },
    ],
  },
];

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto text-xs bg-surface-600 text-surface-100 rounded-full px-1.5 py-0.5 font-semibold">
      {count}
    </span>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const userRole = user?.role ?? '';
  const [badges, setBadges] = useState({ moderation_pending: 0, announce_active: 0 });

  useEffect(() => {
    adminApi.getBadgeCounts()
      .then((data) => setBadges(data))
      .catch(() => {});
  }, []);

  return (
    <aside className="w-64 bg-surface-900 text-surface-300 min-h-screen border-r border-surface-800">
      <div className="p-6 border-b border-surface-800">
        <h2 className="text-sm font-bold text-white tracking-wide">MINDFORUM</h2>
        <p className="text-xs text-surface-500 mt-1 tracking-widest">管理后台</p>
      </div>
      <nav className="py-3">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) =>
            item.roles.includes(userRole as string)
          );
          if (!visibleItems.length) return null;
          return (
            <div key={section.title} className="mb-2">
              <div className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-surface-600">
                {section.title}
              </div>
              {visibleItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
                const badgeCount = item.href === '/admin/content/moderation' ? badges.moderation_pending
                  : item.href === '/admin/settings/announce' ? badges.announce_active : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-surface-800 text-white'
                        : 'text-surface-400 hover:bg-surface-800/50 hover:text-white'
                    }`}
                  >
                    <item.icon className="w-4 h-4 shrink-0 opacity-60" />
                    {item.label}
                    <Badge count={badgeCount} />
                  </Link>
                );
              })}
            </div>
          );
        })}
        <div className="px-5 pt-3">
          <Link href="/" className="text-sm text-surface-500 hover:text-white transition-colors">
            ← 返回论坛
          </Link>
        </div>
      </nav>
    </aside>
  );
}
