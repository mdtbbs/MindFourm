'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { categoryApi, tagApi } from '@/lib/api/client';
import { useSetting } from '@/store/settings-store';
import type { Category, Tag } from '@/types';
import { FolderOpen, Server, ShoppingBag, Trophy, Users } from 'lucide-react';

interface MobileNavMenuProps {
  /** Called after any link is followed, so the parent can close the menu. */
  onNavigate: () => void;
}

const QUICK_LINKS = [
  { href: '/resources', label: '资源中心', icon: FolderOpen, settingKey: 'feature_resources_enabled', fallback: 'true' },
  { href: '/servers', label: '游戏服务器', icon: Server, settingKey: 'feature_servers_enabled', fallback: 'false' },
  { href: '/groups', label: '用户组', icon: Users, settingKey: 'feature_groups_enabled', fallback: 'true' },
  { href: '/leaderboard', label: '积分排行', icon: Trophy, settingKey: 'feature_leaderboard_enabled', fallback: 'true' },
  { href: '/shop', label: '积分商店', icon: ShoppingBag, settingKey: 'feature_shop_enabled', fallback: 'true' },
] as const;

/**
 * Categories, tags and feature links for viewports below the `lg` breakpoint.
 *
 * The desktop sidebar is `hidden lg:block`, so without this there is no path to
 * categories or tags on a phone.
 */
export default function MobileNavMenu({ onNavigate }: MobileNavMenuProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Hooks cannot be called in a loop, so each toggle is read individually.
  const resourcesEnabled = useSetting('feature_resources_enabled', 'true');
  const serversEnabled = useSetting('feature_servers_enabled', 'false');
  const groupsEnabled = useSetting('feature_groups_enabled', 'true');
  const leaderboardEnabled = useSetting('feature_leaderboard_enabled', 'true');
  const shopEnabled = useSetting('feature_shop_enabled', 'true');

  const enabledByKey: Record<string, string | undefined> = {
    feature_resources_enabled: resourcesEnabled,
    feature_servers_enabled: serversEnabled,
    feature_groups_enabled: groupsEnabled,
    feature_leaderboard_enabled: leaderboardEnabled,
    feature_shop_enabled: shopEnabled,
  };

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([categoryApi.getList(), tagApi.getList()]).then(([categoryResult, tagResult]) => {
      if (cancelled) return;
      if (categoryResult.status === 'fulfilled') {
        setCategories(Array.isArray(categoryResult.value) ? categoryResult.value : []);
      }
      if (tagResult.status === 'fulfilled') {
        setTags(Array.isArray(tagResult.value) ? tagResult.value.slice(0, 12) : []);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const quickLinks = QUICK_LINKS.filter(
    (item) => (enabledByKey[item.settingKey] ?? item.fallback) !== 'false',
  );

  return (
    <nav
      aria-label="移动端导航"
      className="md:hidden border-t border-[var(--border)] bg-[var(--bg-card)] px-4 py-4 space-y-5"
    >
      {quickLinks.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {quickLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </div>
      )}

      {categories.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            分类
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.id}`}
                onClick={onNavigate}
                className="rounded px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            标签
          </h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/tags/${tag.slug}`}
                onClick={onNavigate}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
