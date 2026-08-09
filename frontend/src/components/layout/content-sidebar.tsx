'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, type LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import SidebarUserPanel from '@/components/layout/sidebar-user-panel';
import type { SidebarNavigationItem } from '@/lib/navigation/sidebar-navigation';

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

export default function ContentSidebar({
  items,
  siteName,
  sidebarTitle,
  logoUrl,
  userName,
  userMeta,
}: {
  items: SidebarNavigationItem[];
  siteName: string;
  sidebarTitle?: string;
  logoUrl?: string;
  userName?: string;
  userMeta?: string;
}) {
  const pathname = usePathname();

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
        {items.map((item) => {
          const IconComponent = resolveIcon(item.icon);
          const active = isActivePath(pathname, item.href);
          const external =
            item.href.startsWith('http://') || item.href.startsWith('https://');

          return (
            <Link
              key={item.id}
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
        })}
      </nav>

      <div data-testid="sidebar-user" className={SIDEBAR_LAYOUT_CLASSES.user}>
        <SidebarUserPanel userName={userName} userMeta={userMeta} />
      </div>
    </aside>
  );
}
