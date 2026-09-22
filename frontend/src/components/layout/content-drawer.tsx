'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import SidebarUserPanel from '@/components/layout/sidebar-user-panel';
import ContentNavigation from '@/components/layout/content-navigation';
import { contentNavigationCta } from '@/lib/navigation/content-navigation';
import type { Category, ResourceCategory } from '@/types';
import type { ContentSidebarMode } from './content-sidebar';

export const DRAWER_LAYOUT_CLASSES = {
  panel: 'absolute inset-y-0 left-0 flex w-[85vw] max-w-sm flex-col border-r border-[var(--border)] bg-[var(--bg-card)] shadow-xl',
  brand: 'shrink-0 flex items-center justify-between border-b border-[var(--border)] p-4',
  nav: 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4',
  user: 'shrink-0',
} as const;

export default function ContentDrawer({
  open, mode, onClose, siteName, sidebarTitle, logoUrl, sidebarLogoUrl, userName, userId, isAuthenticated, userMeta,
  settings = {}, resourceCategories = [], forumCategories = [],
}: {
  open: boolean; mode: ContentSidebarMode; onClose: () => void; siteName: string; sidebarTitle?: string;
  logoUrl?: string; sidebarLogoUrl?: string; userName?: string; userId?: number; isAuthenticated: boolean; userMeta?: string;
  settings?: Record<string, string>; resourceCategories?: ResourceCategory[]; forumCategories?: Category[];
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', closeOnEscape); };
  }, [open, onClose]);
  if (!open) return null;
  const cta = contentNavigationCta(mode, settings);
  const displayLogoUrl = sidebarLogoUrl || logoUrl;
  return <div data-testid="mobile-drawer" className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="站点导航">
    <button type="button" aria-label="关闭导航菜单" className="absolute inset-0 bg-black/40" onClick={onClose} />
    <div className={DRAWER_LAYOUT_CLASSES.panel}>
      <div data-testid="mobile-drawer-brand" className={DRAWER_LAYOUT_CLASSES.brand}>
        <Link href="/" onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
          {displayLogoUrl ? <img src={displayLogoUrl} alt={siteName} className="h-8 w-auto max-w-full object-contain" /> : <><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">{siteName.slice(0, 1)}</div><div className="min-w-0"><div className="truncate text-sm font-semibold text-[var(--text)]">{siteName}</div><div className="text-xs text-[var(--text-muted)]">{mode === 'resources' ? '资源中心' : sidebarTitle}</div></div></>}
        </Link>
        <button type="button" aria-label="关闭" className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>
      <nav data-testid="mobile-drawer-nav" aria-label="站点导航" className={DRAWER_LAYOUT_CLASSES.nav}>
        <ContentNavigation mode={mode} settings={settings} isAuthenticated={isAuthenticated} userId={userId} forumCategories={forumCategories} resourceCategories={resourceCategories} onNavigate={onClose} />
      </nav>
      {cta && <Link href={cta.href} onClick={onClose} className="mx-3 mb-3 flex shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />{cta.label}</Link>}
      <div data-testid="mobile-drawer-user" className={DRAWER_LAYOUT_CLASSES.user}><SidebarUserPanel userName={userName} userMeta={userMeta} /></div>
    </div>
  </div>;
}
