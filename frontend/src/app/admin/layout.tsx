'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { AdminSidebar as SharedAdminSidebar, SidebarItem, SidebarGroup } from '@/lib/shared';
import { useSetting } from '@/store/settings-store';
import {
  LayoutDashboard, Settings, Megaphone, Palette, Search, FileText, Tag,
  AlertTriangle, Flag, BellRing, FileCheck, Clock, Ban, Trash2, FolderTree, Users, ScrollText,
  Package, AlertCircle, FolderOpen, ToggleLeft, Mail, KeyRound, FileEdit,
  UsersRound, Coins, Puzzle, TrendingUp, Award, ShoppingBag
} from 'lucide-react';
import AdminGuard from '@/components/admin/admin-guard';
import AdminHeader from '@/components/admin/admin-header';

const navGroups: SidebarGroup[] = [
  {
    label: '总览',
    items: [
      { key: 'notifications', label: '后台通知', icon: <BellRing size={16} />, href: '/admin/notifications', roles: ['admin', 'moderator'] },
      { key: 'dashboard', label: '仪表盘', icon: <LayoutDashboard size={16} />, href: '/admin', roles: ['admin', 'moderator'] },
    ],
  },
  {
    label: '站点',
    items: [
      { key: 'settings-basic', label: '基本信息', icon: <Settings size={16} />, href: '/admin/settings/basic', roles: ['admin'] },
      { key: 'settings-navigation', label: '顶部导航', icon: <FolderTree size={16} />, href: '/admin/settings/navigation', roles: ['admin'] },
      { key: 'settings-announce', label: '公告管理', icon: <Megaphone size={16} />, href: '/admin/settings/announce', roles: ['admin'] },
      { key: 'settings-display', label: '显示设置', icon: <Palette size={16} />, href: '/admin/settings/display', roles: ['admin'] },
      { key: 'settings-features', label: '功能管理', icon: <ToggleLeft size={16} />, href: '/admin/settings/features', roles: ['admin'] },
      { key: 'settings-seo', label: 'SEO 设置', icon: <Search size={16} />, href: '/admin/settings/seo', roles: ['admin'] },
      { key: 'settings-notifications', label: '通知设置', icon: <BellRing size={16} />, href: '/admin/settings/notifications', roles: ['admin'] },
      { key: 'settings-email', label: '邮件模板', icon: <Mail size={16} />, href: '/admin/settings/email', roles: ['admin'] },
      { key: 'settings-external-api', label: '外部 API', icon: <KeyRound size={16} />, href: '/admin/settings/external-api', roles: ['admin'] },
      { key: 'settings-terms', label: '条款设置', icon: <FileCheck size={16} />, href: '/admin/settings/terms', roles: ['admin'] },
    ],
  },
  {
    label: '内容',
    items: [
      { key: 'posts', label: '帖子管理', icon: <FileText size={16} />, href: '/admin/posts', roles: ['admin', 'moderator'] },
      { key: 'content-pages', label: '页面管理', icon: <FileEdit size={16} />, href: '/admin/content/pages', roles: ['admin'] },
      { key: 'content-tags', label: '标签管理', icon: <Tag size={16} />, href: '/admin/content/tags', roles: ['admin'] },
      { key: 'content-moderation', label: '审核队列', icon: <AlertTriangle size={16} />, href: '/admin/content/moderation', roles: ['admin', 'moderator'] },
      { key: 'content-reports', label: '举报处理', icon: <Flag size={16} />, href: '/admin/content/reports', roles: ['admin', 'moderator'] },
    ],
  },
  {
    label: '系统',
    items: [
      { key: 'system-rules', label: '发帖规则', icon: <FileCheck size={16} />, href: '/admin/system/rules', roles: ['admin'] },
      { key: 'system-rate-limits', label: '限流设置', icon: <Clock size={16} />, href: '/admin/system/rate-limits', roles: ['admin'] },
      { key: 'system-bans', label: '封禁管理', icon: <Ban size={16} />, href: '/admin/system/bans', roles: ['admin'] },
      { key: 'system-cleanup', label: '数据清理', icon: <Trash2 size={16} />, href: '/admin/system/cleanup', roles: ['admin'] },
    ],
  },
  {
    label: '管理',
    items: [
      { key: 'categories', label: '分类管理', icon: <FolderTree size={16} />, href: '/admin/categories', roles: ['admin'] },
      { key: 'users', label: '用户管理', icon: <Users size={16} />, href: '/admin/users', roles: ['admin'] },
      { key: 'logs', label: '系统日志', icon: <ScrollText size={16} />, href: '/admin/logs', roles: ['admin'] },
    ],
  },
  {
    label: '扩展',
    items: [
      { key: 'groups', label: '用户组管理', icon: <UsersRound size={16} />, href: '/admin/groups', roles: ['admin'] },
      { key: 'points', label: '积分规则', icon: <Coins size={16} />, href: '/admin/points', roles: ['admin'] },
      { key: 'plugins', label: '插件管理', icon: <Puzzle size={16} />, href: '/admin/plugins', roles: ['admin'] },
      { key: 'levels', label: '等级管理', icon: <TrendingUp size={16} />, href: '/admin/levels', roles: ['admin'] },
      { key: 'badges', label: '徽章管理', icon: <Award size={16} />, href: '/admin/badges', roles: ['admin'] },
      { key: 'shop', label: '商城管理', icon: <ShoppingBag size={16} />, href: '/admin/shop', roles: ['admin'] },
    ],
  },
  {
    label: '资源',
    items: [
      { key: 'resources', label: '资源管理', icon: <Package size={16} />, href: '/admin/resources', roles: ['admin', 'moderator'] },
      { key: 'resources-moderation', label: '资源审批', icon: <AlertCircle size={16} />, href: '/admin/resources/moderation', roles: ['admin', 'moderator'] },
      { key: 'resource-categories', label: '类别管理', icon: <FolderOpen size={16} />, href: '/admin/resource-categories', roles: ['admin'] },
    ],
  },
];

function getActiveKey(pathname: string): string {
  const allItems = navGroups.flatMap(g => g.items);
  // Exact match first
  const exactMatch = allItems.find(item => item.href === pathname);
  if (exactMatch) return exactMatch.key;

  // Then prefix match (but not for dashboard)
  const prefixMatch = allItems.find(item =>
    typeof item.href === 'string' && item.href !== '/admin' && pathname.startsWith(item.href)
  );
  return prefixMatch?.key ?? 'dashboard';
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const userRole = user?.role ?? '';
  const resourcesEnabled = useSetting('feature_resources_enabled', 'true');

  // Feature-aware group keys to hide when the corresponding feature is disabled
  const featureGroupMap: Record<string, string> = {
    '资源': 'feature_resources_enabled',
  };

  const featureEnabled: Record<string, string> = {
    'feature_resources_enabled': resourcesEnabled,
  };

  // Filter items by user role, feature toggles, and remove empty groups
  const visibleGroups = navGroups
    .filter(group => {
      const requiredFeature = featureGroupMap[group.label];
      if (requiredFeature && featureEnabled[requiredFeature] === 'false') return false;
      return true;
    })
    .map(group => ({
      ...group,
      items: group.items.filter(item => !item.roles || item.roles.includes(userRole)),
    }))
    .filter(group => group.items.length > 0);

  const activeKey = getActiveKey(pathname);

  return (
    <AdminGuard>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
        <SharedAdminSidebar
          serviceName="MindForum"
          subtitle="管理后台"
          groups={visibleGroups}
          activeKey={activeKey}
          footerContent={
            <Link href="/" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              ← 返回论坛
            </Link>
          }
        />
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          marginLeft: 'var(--sidebar-width)',
        }}>
          <AdminHeader />
          <main style={{ flex: 1, padding: 24 }}>{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}
