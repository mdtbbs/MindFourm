'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import SidebarUserPanel from '@/components/layout/sidebar-user-panel';
import ContentNavigation from '@/components/layout/content-navigation';
import { contentNavigationCta } from '@/lib/navigation/content-navigation';
import type { Category, ResourceCategory } from '@/types';
import { useI18n } from '@/i18n/provider';

export type ContentSidebarMode = 'forum' | 'resources';
export const SIDEBAR_LAYOUT_CLASSES = {
  root: 'hidden w-56 shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)] lg:flex lg:h-[100dvh] lg:flex-col lg:sticky lg:top-0 lg:overflow-hidden',
  brand: 'shrink-0 border-b border-[var(--border)] p-4',
  nav: 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4',
  user: 'shrink-0',
} as const;

function SidebarBrand({ siteName, subtitle, logoUrl, sidebarLogoUrl }: { siteName: string; subtitle?: string; logoUrl?: string; sidebarLogoUrl?: string }) {
  const displayLogoUrl = sidebarLogoUrl || logoUrl;
  return <div data-testid="sidebar-brand" className={SIDEBAR_LAYOUT_CLASSES.brand}><Link href="/" className="flex w-full items-center gap-3 hover:opacity-80">
    {displayLogoUrl ? <img src={displayLogoUrl} alt={siteName} className="h-8 w-auto max-w-full object-contain" /> : <><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">{siteName.slice(0, 1)}</div><div className="min-w-0"><div className="truncate text-sm font-semibold text-[var(--text)]">{siteName}</div>{subtitle && <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>}</div></>}
  </Link></div>;
}

export default function ContentSidebar({
  mode, siteName, sidebarTitle, logoUrl, sidebarLogoUrl, userName, userId, isAuthenticated, userMeta,
  settings = {}, resourceCategories = [], forumCategories = [],
}: {
  mode: ContentSidebarMode; siteName: string; sidebarTitle?: string; logoUrl?: string; sidebarLogoUrl?: string;
  userName?: string; userId?: number; isAuthenticated: boolean; userMeta?: string;
  settings?: Record<string, string>; resourceCategories?: ResourceCategory[]; forumCategories?: Category[];
}) {
  const navRef = useRef<HTMLElement>(null);
  const { t } = useI18n();
  useEffect(() => { navRef.current?.scrollTo({ top: 0 }); }, [mode]);
  const cta = contentNavigationCta(mode, settings);
  return <aside data-testid="content-sidebar" className={SIDEBAR_LAYOUT_CLASSES.root}>
    <SidebarBrand siteName={siteName} subtitle={mode === 'resources' ? t('resources.title') : sidebarTitle} logoUrl={logoUrl} sidebarLogoUrl={sidebarLogoUrl} />
    <nav ref={navRef} data-testid="sidebar-nav" aria-label={t('navigation.siteNavigation')} className={SIDEBAR_LAYOUT_CLASSES.nav}>
      <ContentNavigation mode={mode} settings={settings} isAuthenticated={isAuthenticated} userId={userId} forumCategories={forumCategories} resourceCategories={resourceCategories} />
    </nav>
    {cta && <Link href={cta.href} className="mx-3 mb-3 flex shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-dark)]"><Plus className="h-4 w-4" />{cta.label}</Link>}
    <div data-testid="sidebar-user" className={SIDEBAR_LAYOUT_CLASSES.user}><SidebarUserPanel userName={userName} userMeta={userMeta} /></div>
  </aside>;
}
