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
    <aside className="hidden w-72 shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)] lg:flex lg:min-h-screen lg:flex-col lg:sticky lg:top-0">
      <div className="border-b border-[var(--border)] p-4">
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

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const IconComponent = resolveIcon(item.icon);
          const active = isActivePath(pathname, item.href);
          const external =
            item.href.startsWith('http://') || item.href.startsWith('https://');

          return (
            <Link
              key={item.id}
              href={item.href}
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

      <SidebarUserPanel userName={userName} userMeta={userMeta} />
    </aside>
  );
}
