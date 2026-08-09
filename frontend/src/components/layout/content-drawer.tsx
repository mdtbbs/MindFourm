'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, Home, type LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
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

export default function ContentDrawer({
  open,
  items,
  onClose,
  siteName,
}: {
  open: boolean;
  items: SidebarNavigationItem[];
  onClose: () => void;
  siteName: string;
}) {
  const pathname = usePathname();

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
    <div className="fixed inset-0 z-[60] lg:hidden">
      <button
        type="button"
        aria-label="关闭导航菜单"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 flex w-[85vw] max-w-sm flex-col border-r border-[var(--border)] bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
          <Link href="/" onClick={onClose} className="text-sm font-semibold text-[var(--text)]">
            {siteName}
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
        <nav
          onClick={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('a')) onClose();
          }}
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4"
        >
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
      </div>
    </div>
  );
}
