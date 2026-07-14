'use client';

import Link from 'next/link';
import { Category, Tag } from '@/types';
import { FolderOpen, Server, Users, Trophy, ShoppingBag } from 'lucide-react';
import { useSetting } from '@/store/settings-store';

interface SidebarProps {
  categories: Category[];
  tags: Tag[];
  selectedCategory?: number;
}

const allQuickLinks = [
  { href: '/resources', label: '资源中心', icon: FolderOpen, settingKey: 'feature_resources_enabled' },
  { href: '/servers', label: '游戏服务器', icon: Server, settingKey: 'feature_servers_enabled' },
  { href: '/groups', label: '用户组', icon: Users, settingKey: 'feature_groups_enabled' },
  { href: '/leaderboard', label: '积分排行', icon: Trophy, settingKey: 'feature_leaderboard_enabled' },
  { href: '/shop', label: '积分商店', icon: ShoppingBag, settingKey: 'feature_shop_enabled' },
] as const;

export default function Sidebar({ categories, tags, selectedCategory }: SidebarProps) {
  const resourcesEnabled = useSetting('feature_resources_enabled', 'true');
  const serversEnabled = useSetting('feature_servers_enabled', 'false');
  const groupsEnabled = useSetting('feature_groups_enabled', 'true');
  const leaderboardEnabled = useSetting('feature_leaderboard_enabled', 'true');
  const shopEnabled = useSetting('feature_shop_enabled', 'true');

  const enabledMap: Record<string, string> = {
    feature_resources_enabled: resourcesEnabled,
    feature_servers_enabled: serversEnabled,
    feature_groups_enabled: groupsEnabled,
    feature_leaderboard_enabled: leaderboardEnabled,
    feature_shop_enabled: shopEnabled,
  };

  const quickLinks = allQuickLinks.filter(
    (item) => enabledMap[item.settingKey] !== 'false',
  );

  return (
    <aside className="space-y-4">
      <section className="panel-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            分类
          </h3>
          <span className="text-[11px] text-[var(--muted-foreground)]">{categories.length}</span>
        </div>
        <nav className="space-y-1">
          <Link
            href="/"
            className={`flex items-center justify-between border px-3 py-2 text-sm transition-colors ${
              !selectedCategory
                ? 'border-[var(--primary)] bg-[rgba(47,128,237,0.06)] text-[var(--primary)]'
                : 'border-[var(--border)] text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
            }`}
          >
            <span>全部帖子</span>
          </Link>
          {categories
            .filter((c) => c.is_active)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.id}`}
                className={`flex items-center justify-between border px-3 py-2 text-sm transition-colors ${
                  selectedCategory === category.id
                    ? 'border-[var(--primary)] bg-[rgba(47,128,237,0.06)] text-[var(--primary)]'
                    : 'border-[var(--border)] text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                }`}
                title={category.name}
              >
                <span className="truncate">{category.name}</span>
              </Link>
            ))}
        </nav>
      </section>

      {tags.length > 0 && (
        <section className="panel-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              热门标签
            </h3>
            <span className="text-[11px] text-[var(--muted-foreground)]">{Math.min(tags.length, 20)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 20).map((tag) => (
              <Link
                key={tag.id}
                href={`/tags/${tag.slug}`}
                className="border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 text-xs text-[var(--foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                title={tag.name}
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {quickLinks.length > 0 && (
        <section className="panel-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              快捷入口
            </h3>
          </div>
          <div className="space-y-2">
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
