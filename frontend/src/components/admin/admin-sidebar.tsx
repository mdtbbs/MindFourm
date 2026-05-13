'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';

const navSections = [
  {
    title: '概览',
    items: [
      { href: '/admin', label: '仪表盘', icon: '◈', roles: ['admin', 'moderator'] },
    ],
  },
  {
    title: '站点',
    items: [
      { href: '/admin/settings/basic', label: '基本信息', icon: '◼', roles: ['admin'] },
      { href: '/admin/settings/announce', label: '公告管理', icon: '◻', roles: ['admin'] },
      { href: '/admin/settings/display', label: '显示设置', icon: '▭', roles: ['admin'] },
      { href: '/admin/settings/seo', label: 'SEO 设置', icon: '◇', roles: ['admin'] },
    ],
  },
  {
    title: '内容',
    items: [
      { href: '/admin/posts', label: '帖子管理', icon: '▣', roles: ['admin', 'moderator'] },
      { href: '/admin/content/tags', label: '标签管理', icon: '⧫', roles: ['admin'] },
      { href: '/admin/content/moderation', label: '审核队列', icon: '△', roles: ['admin', 'moderator'] },
    ],
  },
  {
    title: '系统',
    items: [
      { href: '/admin/system/rules', label: '发帖规则', icon: '⊠', roles: ['admin'] },
      { href: '/admin/system/rate-limits', label: '限流设置', icon: '◷', roles: ['admin'] },
      { href: '/admin/system/bans', label: '封禁管理', icon: '⊘', roles: ['admin'] },
      { href: '/admin/system/cleanup', label: '数据清理', icon: '◎', roles: ['admin'] },
    ],
  },
  {
    title: '管理',
    items: [
      { href: '/admin/categories', label: '分类管理', icon: '▤', roles: ['admin'] },
      { href: '/admin/users', label: '用户管理', icon: '⬡', roles: ['admin'] },
      { href: '/admin/logs', label: '系统日志', icon: '▦', roles: ['admin'] },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const userRole = user?.role ?? '';

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
                    <span className="w-5 text-center text-base opacity-60">{item.icon}</span>
                    {item.label}
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
