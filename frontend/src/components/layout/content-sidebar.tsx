'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, type LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import SidebarUserPanel from '@/components/layout/sidebar-user-panel';
import { getIconComponent } from '@/lib/resource-icons';
import type { SidebarNavigationItem } from '@/lib/navigation/sidebar-navigation';
import type { ResourceCategory, Category } from '@/types';

function resolveIcon(name: string): LucideIcon {
  const entry = (LucideIcons as Record<string, unknown>)[name];
  if (typeof entry === 'function') {
    return entry as LucideIcon;
  }
  return Home;
}

function isActivePath(currentPathname: string | null, href: string): boolean {
  if (!currentPathname) return false;
  if (href === '/') return currentPathname === '/';
  return currentPathname === href || currentPathname.startsWith(`${href}/`);
}

function isCategoryActive(categoryId: number, currentPathname: string | null | undefined): boolean {
  if (!currentPathname || !currentPathname.startsWith('/resources')) return false;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('category_id') === String(categoryId);
}

function isForumCategoryActive(categoryId: number, currentPathname: string | null | undefined): boolean {
  return currentPathname === `/categories/${categoryId}`;
}

function ResourceCategoryList({
  categories,
  currentPathname,
}: {
  categories: ResourceCategory[];
  currentPathname: string | null | undefined;
}) {
  return (
    <ul className="space-y-0.5">
      {categories.map((category) => {
        const IconComponent = getIconComponent(category.icon ?? 'Folder');
        const href = `/resources?category_id=${category.id}`;
        const active = isCategoryActive(category.id, currentPathname);
        return (
          <li key={category.id}>
            <Link
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'
              }`}
            >
              <IconComponent className="h-4 w-4 shrink-0" />
              <span className="truncate">{category.name}</span>
            </Link>
          </li>
        );
      })}
      {categories.length === 0 && (
        <li className="px-3 py-1.5 text-sm text-[var(--text-muted)]">暂无分类</li>
      )}
    </ul>
  );
}

function ForumBoardList({
  categories,
  currentPathname,
}: {
  categories: Category[];
  currentPathname: string | null | undefined;
}) {
  return (
    <ul className="space-y-0.5">
      {categories.map((cat) => {
        const href = `/categories/${cat.id}`;
        const active = isForumCategoryActive(cat.id, currentPathname);
        return (
          <li key={cat.id}>
            <Link
              href={href}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-[var(--primary-soft)] text-[var(--primary)] font-medium'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'
              }`}
            >
              <span className="truncate">{cat.name}</span>
              {cat.post_count !== undefined && (
                <span className="shrink-0 text-xs opacity-60">{cat.post_count}</span>
              )}
            </Link>
          </li>
        );
      })}
      {categories.length === 0 && (
        <li className="px-3 py-1.5 text-sm text-[var(--text-muted)]">暂无板块</li>
      )}
    </ul>
  );
}

/**
 * Layout class tokens for the desktop sidebar.
 *
 * The sidebar must use a fixed viewport height (`h-[100dvh]`) so that the
 * navigation region can scroll independently. Using `min-h-screen` would
 * let the aside grow past the viewport and push the whole page into a
 * single scroll, which breaks the sticky layout on long nav lists.
 *
 * Exported for testability — see `content-sidebar.spec.ts`.
 */
export const SIDEBAR_LAYOUT_CLASSES = {
  /** Root <aside> — pinned, viewport-height, overflow-clipped flex column. */
  root: 'hidden w-72 shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)] lg:flex lg:h-[100dvh] lg:flex-col lg:sticky lg:top-0 lg:overflow-hidden',
  /** Brand / logo header — must not shrink. */
  brand: 'shrink-0 border-b border-[var(--border)] p-4',
  /** Navigation region — flex-grows to fill, scrolls vertically. */
  nav: 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4',
  /** User panel footer — must not shrink. */
  user: 'shrink-0',
} as const;

function SidebarNavItem({
  item,
  effectivePathname,
}: {
  item: SidebarNavigationItem;
  effectivePathname: string | null;
}) {
  const IconComponent = resolveIcon(item.icon);
  const active = isActivePath(effectivePathname, item.href);
  const external = item.href.startsWith('http://') || item.href.startsWith('https://');

  return (
    <Link
      href={item.href}
      data-testid={`sidebar-nav-item-${item.id}`}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer noopener' : undefined}
      prefetch={!external ? undefined : false}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'
      }`}
    >
      <IconComponent className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export default function ContentSidebar({
  items,
  siteName,
  sidebarTitle,
  logoUrl,
  userName,
  userMeta,
  resourceCategories,
  forumCategories,
  currentPathname,
}: {
  items: SidebarNavigationItem[];
  siteName: string;
  sidebarTitle?: string;
  logoUrl?: string;
  userName?: string;
  userMeta?: string;
  resourceCategories?: ResourceCategory[];
  forumCategories?: Category[];
  currentPathname?: string | null;
}) {
  const pathname = usePathname();
  const effectivePathname = currentPathname ?? pathname;

  // Replace the static "分类" link with dynamic forum boards
  const primaryItems = items.filter((item) => item.id !== 'categories');
  const homeItem = primaryItems.find((item) => item.id === 'home');
  const restItems = primaryItems.filter((item) => item.id !== 'home');
  const boards = forumCategories ?? [];

  return (
    <aside data-testid="content-sidebar" className={SIDEBAR_LAYOUT_CLASSES.root}>
      <div data-testid="sidebar-brand" className={SIDEBAR_LAYOUT_CLASSES.brand}>
        <Link href="/" className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={siteName} className="h-8 max-w-[140px] object-contain" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-sm font-bold text-white">
              {siteName.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--text)]">{siteName}</div>
            <div className="text-xs text-[var(--text-muted)]">{sidebarTitle}</div>
          </div>
        </Link>
      </div>

      <nav data-testid="sidebar-nav" role="navigation" className={SIDEBAR_LAYOUT_CLASSES.nav}>
        {homeItem && (
          <SidebarNavItem item={homeItem} effectivePathname={effectivePathname} />
        )}

        {boards.length > 0 && (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              论坛板块
            </div>
            <ForumBoardList categories={boards} currentPathname={effectivePathname} />
          </div>
        )}

        {restItems.map((item) => (
          <SidebarNavItem key={item.id} item={item} effectivePathname={effectivePathname} />
        ))}

        {resourceCategories && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              资源分类
            </div>
            <ResourceCategoryList categories={resourceCategories} currentPathname={effectivePathname} />
          </div>
        )}
      </nav>

      <div data-testid="sidebar-user" className={SIDEBAR_LAYOUT_CLASSES.user}>
        <SidebarUserPanel userName={userName} userMeta={userMeta} />
      </div>
    </aside>
  );
}
