'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { LayoutDashboard, FolderTree, Users, FileText, ScrollText } from 'lucide-react';

const navItems = [
  { href: '/admin', label: '仪表盘', icon: LayoutDashboard, roles: ['admin', 'moderator'] as const },
  { href: '/admin/categories', label: '分类管理', icon: FolderTree, roles: ['admin'] as const },
  { href: '/admin/users', label: '用户管理', icon: Users, roles: ['admin'] as const },
  { href: '/admin/posts', label: '帖子管理', icon: FileText, roles: ['admin', 'moderator'] as const },
  { href: '/admin/logs', label: '操作日志', icon: ScrollText, roles: ['admin'] as const },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const filteredNavItems = navItems.filter((item) =>
    item.roles.includes(user?.role || '')
  );

  return (
    <aside className="w-64 bg-surface-800 text-surface-100 min-h-screen">
      <div className="p-6">
        <h2 className="text-lg font-bold">管理后台</h2>
      </div>
      <nav className="px-4 space-y-1">
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-surface-300 hover:bg-surface-700 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/"
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-surface-300 hover:bg-surface-700 hover:text-white transition-colors mt-4"
        >
          返回论坛
        </Link>
      </nav>
    </aside>
  );
}
