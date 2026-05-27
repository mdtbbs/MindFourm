'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { AdminSidebar as SharedAdminSidebar, SidebarItem } from '@/components/shared/AdminSidebar';
import {
  LayoutDashboard, Settings, Megaphone, Palette, Search, FileText, Tag,
  AlertTriangle, FileCheck, Clock, Ban, Trash2, FolderTree, Users, ScrollText,
  Package, AlertCircle, FolderOpen
} from 'lucide-react';
import AdminGuard from '@/components/admin/admin-guard';
import AdminHeader from '@/components/admin/admin-header';

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  roles: string[];
}

const navItems: NavItem[] = [
  // Overview
  { key: 'dashboard', label: '仪表盘', icon: <LayoutDashboard size={16} />, href: '/admin', roles: ['admin', 'moderator'] },
  // Site
  { key: 'settings-basic', label: '基本信息', icon: <Settings size={16} />, href: '/admin/settings/basic', roles: ['admin'] },
  { key: 'settings-announce', label: '公告管理', icon: <Megaphone size={16} />, href: '/admin/settings/announce', roles: ['admin'] },
  { key: 'settings-display', label: '显示设置', icon: <Palette size={16} />, href: '/admin/settings/display', roles: ['admin'] },
  { key: 'settings-seo', label: 'SEO 设置', icon: <Search size={16} />, href: '/admin/settings/seo', roles: ['admin'] },
  // Content
  { key: 'posts', label: '帖子管理', icon: <FileText size={16} />, href: '/admin/posts', roles: ['admin', 'moderator'] },
  { key: 'content-tags', label: '标签管理', icon: <Tag size={16} />, href: '/admin/content/tags', roles: ['admin'] },
  { key: 'content-moderation', label: '审核队列', icon: <AlertTriangle size={16} />, href: '/admin/content/moderation', roles: ['admin', 'moderator'] },
  // System
  { key: 'system-rules', label: '发帖规则', icon: <FileCheck size={16} />, href: '/admin/system/rules', roles: ['admin'] },
  { key: 'system-rate-limits', label: '限流设置', icon: <Clock size={16} />, href: '/admin/system/rate-limits', roles: ['admin'] },
  { key: 'system-bans', label: '封禁管理', icon: <Ban size={16} />, href: '/admin/system/bans', roles: ['admin'] },
  { key: 'system-cleanup', label: '数据清理', icon: <Trash2 size={16} />, href: '/admin/system/cleanup', roles: ['admin'] },
  // Management
  { key: 'categories', label: '分类管理', icon: <FolderTree size={16} />, href: '/admin/categories', roles: ['admin'] },
  { key: 'users', label: '用户管理', icon: <Users size={16} />, href: '/admin/users', roles: ['admin'] },
  { key: 'logs', label: '系统日志', icon: <ScrollText size={16} />, href: '/admin/logs', roles: ['admin'] },
  // Resources
  { key: 'resources', label: '资源管理', icon: <Package size={16} />, href: '/admin/resources', roles: ['admin', 'moderator'] },
  { key: 'resources-moderation', label: '资源审批', icon: <AlertCircle size={16} />, href: '/admin/resources/moderation', roles: ['admin', 'moderator'] },
  { key: 'resource-categories', label: '类别管理', icon: <FolderOpen size={16} />, href: '/admin/resource-categories', roles: ['admin'] },
];

function getActiveKey(pathname: string): string {
  // Exact match first
  const exactMatch = navItems.find(item => item.href === pathname);
  if (exactMatch) return exactMatch.key;

  // Then prefix match (but not for dashboard)
  const prefixMatch = navItems.find(item =>
    item.href !== '/admin' && pathname.startsWith(item.href)
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

  // Filter items by user role
  const visibleItems = navItems.filter(item => item.roles.includes(userRole));

  // Convert to SidebarItem format
  const sidebarItems: SidebarItem[] = visibleItems.map(item => ({
    key: item.key,
    label: item.label,
    icon: item.icon,
    href: item.href,
  }));

  const activeKey = getActiveKey(pathname);

  return (
    <AdminGuard>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
        <SharedAdminSidebar
          serviceName="MindForum"
          subtitle="管理后台"
          items={sidebarItems}
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