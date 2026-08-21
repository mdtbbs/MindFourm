'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, Home, type LucideIcon } from 'lucide-react';
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
  onClose,
}: {
  categories: ResourceCategory[];
  currentPathname: string | null | undefined;
  onClose: () => void;
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
              onClick={onClose}
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

function DrawerNavItem({
  item,
  effectivePathname,
  onClose,
}: {
  item: SidebarNavigationItem;
  effectivePathname: string | null;
  onClose: () => void;
}) {
  const IconComponent = resolveIcon(item.icon);
  const active = isActivePath(effectivePathname, item.href);
  const external = item.href.startsWith('http://') || item.href.startsWith('https://');

  return (
    <Link
      href={item.href}
      onClick={onClose}
      data-testid={`drawer-nav-item-${item.id}`}
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

function DrawerForumBoard({
  category,
  currentPathname,
  onClose,
}: {
  category: Category;
  currentPathname: string | null | undefined;
  onClose: () => void;
}) {
  const href = `/categories/${category.id}`;
  const active = isForumCategoryActive(category.id, currentPathname);
  return (
    <li>
      <Link
        href={href}
        onClick={onClose}
        className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
          active
            ? 'bg-[var(--primary-soft)] text-[var(--primary)] font-medium'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'
        }`}
      >
        <span className="truncate">{category.name}</span>
        {category.post_count !== undefined && (
          <span className="shrink-0 text-xs opacity-60">{category.post_count}</span>
        )}
      </Link>
    </li>
  );
}

/**
 * Layout class tokens for the mobile drawer.
 *
 * Mirrors the sidebar height model: the drawer panel uses a fixed viewport
 * height (`h-screen`) with a flex-column layout where the header and user
 * sections are `shrink-0` and the navigation region scrolls independently.
 *
 * Exported for testability — see `content-drawer.spec.ts`.
 */
export const DRAWER_LAYOUT_CLASSES = {
  /** Drawer panel — fixed, viewport-height, overflow-clipped flex column. */
  panel:
    'absolute inset-y-0 left-0 flex w-[85vw] max-w-sm flex-col border-r border-[var(--border)] bg-[var(--bg-card)] shadow-xl',
  /** Brand / logo header — must not shrink. */
  brand: 'shrink-0 flex items-center justify-between border-b border-[var(--border)] p-4',
  /** Navigation region — flex-grows to fill, scrolls vertically. */
  nav: 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4',
  /** User panel footer — must not shrink. */
  user: 'shrink-0',
} as const;

export default function ContentDrawer({
  open,
  items,
  onClose,
  siteName,
  sidebarTitle,
  logoUrl,
  userName,
  userMeta,
  resourceCategories,
  forumCategories,
  currentPathname,
}: {
  open: boolean;
  items: SidebarNavigationItem[];
  onClose: () => void;
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

  const primaryItems = items.filter((item) => item.id !== 'categories');
  const homeItem = primaryItems.find((item) => item.id === 'home');
  const restItems = primaryItems.filter((item) => item.id !== 'home');
  const boards = forumCategories ?? [];

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div data-testid="mobile-drawer" className="fixed inset-0 z-[60] lg:hidden">
      <button
        type="button"
        aria-label="关闭导航菜单"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className={DRAWER_LAYOUT_CLASSES.panel}>
        {/* Header — shrink-0 */}
        <div data-testid="mobile-drawer-brand" className={DRAWER_LAYOUT_CLASSES.brand}>
          <Link href="/" onClick={onClose} className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt={siteName} className="h-8 max-w-[140px] object-contain" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-sm font-bold text-white">
                {siteName.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--text)]">{siteName}</div>
              {sidebarTitle && (
                <div className="text-xs text-[var(--text-muted)]">{sidebarTitle}</div>
              )}
            </div>
          </Link>
          <button
            type="button"
            aria-label="关闭"
            className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation — scrollable */}
        <nav
          data-testid="mobile-drawer-nav"
          onClick={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('a')) onClose();
          }}
          className={DRAWER_LAYOUT_CLASSES.nav}
        >
          {homeItem && (
            <DrawerNavItem item={homeItem} effectivePathname={effectivePathname} onClose={onClose} />
          )}

          {boards.length > 0 && (
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                论坛板块
              </div>
              <ul className="space-y-0.5">
                {boards.map((cat) => (
                  <DrawerForumBoard
                    key={cat.id}
                    category={cat}
                    currentPathname={effectivePathname}
                    onClose={onClose}
                  />
                ))}
              </ul>
            </div>
          )}

          {restItems.map((item) => (
            <DrawerNavItem key={item.id} item={item} effectivePathname={effectivePathname} onClose={onClose} />
          ))}

          {resourceCategories && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                资源分类
              </div>
              <ResourceCategoryList categories={resourceCategories} currentPathname={effectivePathname} onClose={onClose} />
            </div>
          )}
        </nav>

        {/* User section — shrink-0 */}
        <div data-testid="mobile-drawer-user" className={DRAWER_LAYOUT_CLASSES.user}>
          <SidebarUserPanel userName={userName} userMeta={userMeta} />
        </div>
      </div>
    </div>
  );
}
