'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, MessageCircle, Package, Radio, UserRound, Wrench } from 'lucide-react';
import SidebarUserPanel from '@/components/layout/sidebar-user-panel';
import ContentNavigation from '@/components/layout/content-navigation';
import { useNavigation } from '@/lib/navigation/context';
import { isWorkspaceActive, resolveWorkspace, WORKSPACE_SPACES } from '@/lib/navigation/workspace-navigation';
import { useI18n } from '@/i18n/provider';

export type ContentSidebarMode = 'forum' | 'resources';

// `h-full` (not `sticky`/`100dvh`) keeps the column bound to the shell's
// viewport height on desktop, so only short pages flex to fill the space and
// long pages scroll with the document instead of pinning a 100vh rail.
export const SIDEBAR_LAYOUT_CLASSES = {
  root: 'hidden w-56 shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)] lg:flex lg:h-full lg:flex-col lg:overflow-hidden',
  brand: 'shrink-0 border-b border-[var(--border)] p-4',
  nav: 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4',
  user: 'shrink-0',
} as const;

function SidebarBrand({ siteName, logoUrl, sidebarLogoUrl }: { siteName: string; logoUrl?: string; sidebarLogoUrl?: string }) {
  const displayLogoUrl = sidebarLogoUrl || logoUrl;
  return <div data-testid="sidebar-brand" className={SIDEBAR_LAYOUT_CLASSES.brand}><Link href="/" className="flex w-full items-center gap-3 hover:opacity-80">
    {displayLogoUrl ? <img src={displayLogoUrl} alt={siteName} className="h-8 w-auto max-w-full object-contain" /> : <><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--primary-button)] text-sm font-bold text-white">{siteName.slice(0, 1)}</div><div className="min-w-0"><div className="truncate text-sm font-semibold text-[var(--text)]">{siteName}</div></div></>}
  </Link></div>;
}

export default function ContentSidebar({
  siteName, logoUrl, sidebarLogoUrl, userName, userId, userMeta, isAuthenticated = false, settings = {},
}: {
  mode?: ContentSidebarMode; siteName: string; sidebarTitle?: string; logoUrl?: string; sidebarLogoUrl?: string;
  userName?: string; userId?: number; isAuthenticated?: boolean; userMeta?: string;
  settings?: Record<string, string>; resourceCategories?: unknown[]; forumCategories?: unknown[];
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const navigation = useNavigation();
  const workspace = resolveWorkspace(pathname, userId);
  const contextMode = workspace === 'resources' ? 'resources' : workspace === 'community' ? 'forum' : null;
  const icons = { home: Home, community: MessageCircle, resources: Package, multiplayer: Radio, tools: Wrench, me: UserRound } as const;
  // `me` is rendered separately at the foot of the nav column so the short/tall
  // page behaviour stays identical in both branches of the merge.
  const personalSpace = WORKSPACE_SPACES.find((space) => space.id === 'me')!;
  const personalActive = isWorkspaceActive(pathname, personalSpace.href, userId);
  const PersonalIcon = icons.me;
  return <aside data-testid="content-sidebar" className={SIDEBAR_LAYOUT_CLASSES.root}>
    <SidebarBrand siteName={siteName} logoUrl={logoUrl} sidebarLogoUrl={sidebarLogoUrl} />
    <nav data-testid="sidebar-nav" aria-label={t('navigation.siteNavigation')} className={`${SIDEBAR_LAYOUT_CLASSES.nav} gap-1`}>
      {WORKSPACE_SPACES.filter((space) => space.id !== 'me').map((space) => {
        const Icon = icons[space.id];
        const active = isWorkspaceActive(pathname, space.href, userId);
        return <Link key={space.id} href={space.href} aria-current={active ? 'page' : undefined} className={`relative flex min-h-11 items-center gap-3 px-3 text-sm transition-colors before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-[var(--primary)] ${active ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary)] before:opacity-100' : 'text-[var(--text-secondary)] before:opacity-0 hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{t(space.labelKey)}</span>
        </Link>;
      })}
      {contextMode && <ContentNavigation
        mode={contextMode}
        settings={settings}
        isAuthenticated={isAuthenticated}
        userId={userId}
        forumCategories={navigation.forumCategories}
        resourceCategories={navigation.resourceCategories}
        contextOnly
      />}
      {/* Pushed to the bottom of the nav column: on short pages it parks the
          personal entry at the rail's foot without leaving a dead gap, and on
          tall pages it sits directly under the workspace list. */}
      <div className="mt-auto pt-3">
        <div className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">{t('navigation.personal')}</div>
        <Link href={personalSpace.href} aria-current={personalActive ? 'page' : undefined} className={`relative flex min-h-11 items-center gap-3 px-3 text-sm transition-colors before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-[var(--primary)] ${personalActive ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary)] before:opacity-100' : 'text-[var(--text-secondary)] before:opacity-0 hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'}`}>
          <PersonalIcon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{t(personalSpace.labelKey)}</span>
        </Link>
      </div>
    </nav>
    <div data-testid="sidebar-user" className={SIDEBAR_LAYOUT_CLASSES.user}><SidebarUserPanel userName={userName} userMeta={userMeta} /></div>
  </aside>;
}
