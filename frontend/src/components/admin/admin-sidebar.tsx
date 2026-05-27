'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import {
  LayoutDashboard, Settings, Megaphone, Palette, Search, FileText, Tag,
  AlertTriangle, FileCheck, Clock, Ban, Trash2, FolderTree, Users, ScrollText,
  Package, AlertCircle, FolderOpen
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
];

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span style={{
      marginLeft: 'auto',
      fontSize: 11,
      background: 'var(--primary)',
      color: '#fff',
      borderRadius: 999,
      padding: '2px 6px',
      fontWeight: 500,
    }}>
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
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/badge-counts`, {
      credentials: 'include',
    })
      .then(r => r.json())
      .then(j => { if (j.success) setBadges(j.data); })
      .catch(() => {});
  }, []);

  return (
    <aside
      className="admin-sidebar"
      style={{
        width: 'var(--sidebar-width)',
        position: 'fixed',
        left: 0,
        top: 0,
        height: '100vh',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>MindForum</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>管理后台</p>
      </div>
      <nav style={{ padding: 12 }}>
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) =>
            item.roles.includes(userRole as string)
          );
          if (!visibleItems.length) return null;
          return (
            <div key={section.title} style={{ marginBottom: 8 }}>
              <div style={{
                padding: '8px 12px',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}>
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      fontSize: 13,
                      borderRadius: 6,
                      marginBottom: 2,
                      transition: 'all 0.15s ease',
                      background: isActive ? 'var(--bg-elevated)' : 'transparent',
                      color: isActive ? 'var(--text)' : 'var(--text-secondary)',
                    }}
                  >
                    <item.icon style={{ width: 16, height: 16, opacity: 0.6 }} />
                    {item.label}
                    <Badge count={badgeCount} />
                  </Link>
                );
              })}
            </div>
          );
        })}
        <div style={{ padding: '12px 12px', marginTop: 12, borderTop: '1px solid var(--border-light)' }}>
          <Link href="/" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            ← 返回论坛
          </Link>
        </div>
      </nav>
    </aside>
  );
}
