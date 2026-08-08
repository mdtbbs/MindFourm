'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { SiteNavigationModel } from '@/lib/navigation/site-navigation';
import SidebarNavGroups from '@/components/layout/sidebar-nav-groups';

export default function ContentDrawer({
  open,
  navigation,
  onClose,
  onLogin,
  onRegister,
  siteName,
}: {
  open: boolean;
  navigation: SiteNavigationModel;
  currentPathname: string;
  onClose: () => void;
  onLogin: () => void;
  onRegister: () => void;
  siteName: string;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

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
        <div onClick={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('a')) {
            onClose();
          }
        }} className="flex min-h-0 flex-1 flex-col">
          <SidebarNavGroups
            primaryItems={navigation.primaryItems}
            groups={navigation.groups}
            personalItems={navigation.personalItems}
            quickActions={navigation.quickActions}
            onLogin={onLogin}
            onRegister={onRegister}
          />
        </div>
      </div>
    </div>
  );
}
