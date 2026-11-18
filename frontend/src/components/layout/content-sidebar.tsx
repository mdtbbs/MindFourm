'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, MessageCircle, Package, PanelLeftClose, PanelLeftOpen, Radio, UserRound, Wrench } from 'lucide-react';
import SidebarUserPanel from '@/components/layout/sidebar-user-panel';
import ContentNavigation from '@/components/layout/content-navigation';
import { useNavigation } from '@/lib/navigation/context';
import { isWorkspaceActive, resolveWorkspace, WORKSPACE_SPACES } from '@/lib/navigation/workspace-navigation';
import { useI18n } from '@/i18n/provider';

export type ContentSidebarMode = 'forum' | 'resources';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'mdtbbs:sidebar-collapsed';

// `h-full` (not `sticky`/`100dvh`) keeps the column bound to the shell's
// viewport height on desktop, so only short pages flex to fill the space and
// long pages scroll with the document instead of pinning a 100vh rail.
export const SIDEBAR_LAYOUT_CLASSES = {
  root: 'hidden w-56 shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)] transition-[width] duration-[var(--motion-fast)] lg:flex lg:h-full lg:flex-col lg:overflow-hidden',
  brand: 'shrink-0 border-b border-[var(--border)] p-3',
  nav: 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 py-3',
  user: 'shrink-0',
} as const;

function SidebarBrand({
  siteName,
  logoUrl,
  sidebarLogoUrl,
  collapsed,
  onToggleCollapse,
}: {
  siteName: string;
  logoUrl?: string;
  sidebarLogoUrl?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const displayLogoUrl = sidebarLogoUrl || logoUrl;
  return (
    <div data-testid="sidebar-brand" className={SIDEBAR_LAYOUT_CLASSES.brand}>
      <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between gap-2'}`}>
        <Link
          href="/"
          title={siteName}
          className={`flex min-w-0 items-center hover:opacity-80 ${collapsed ? 'justify-center' : 'flex-1 gap-2.5'}`}
        >
          {displayLogoUrl ? (
            <img src={displayLogoUrl} alt={siteName} className="h-8 w-auto max-w-full object-contain" />
          ) : (
            <>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--primary)] bg-[var(--primary-button)] font-mono text-sm font-bold text-white">
                {siteName.slice(0, 1)}
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold tracking-tight text-[var(--text)]">{siteName}</div>
                  <div className="truncate font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">SECTOR // BBS</div>
                </div>
              )}
            </>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggleCollapse}
          data-testid="sidebar-collapse-toggle"
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-expanded={!collapsed}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1') {
        setCollapsed(true);
      }
    } catch {
      // Ignore storage access errors in restricted environments.
    }
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
  };

  const workspace = resolveWorkspace(pathname, userId);
  const contextMode = workspace === 'resources' ? 'resources' : workspace === 'community' ? 'forum' : null;
  const icons = { home: Home, community: MessageCircle, resources: Package, multiplayer: Radio, tools: Wrench, me: UserRound } as const;
  // `me` is rendered separately at the foot of the nav column so the short/tall
  // page behaviour stays identical in both branches of the merge.
  const personalSpace = WORKSPACE_SPACES.find((space) => space.id === 'me')!;
  const personalActive = isWorkspaceActive(pathname, personalSpace.href, userId);
  const PersonalIcon = icons.me;
  const rootClassName = collapsed
    ? SIDEBAR_LAYOUT_CLASSES.root.replace('w-56', 'w-16')
    : SIDEBAR_LAYOUT_CLASSES.root;

  return (
    <aside data-testid="content-sidebar" data-collapsed={collapsed ? 'true' : 'false'} className={rootClassName}>
      <SidebarBrand
        siteName={siteName}
        logoUrl={logoUrl}
        sidebarLogoUrl={sidebarLogoUrl}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />
      <nav data-testid="sidebar-nav" aria-label={t('navigation.siteNavigation')} className={`${SIDEBAR_LAYOUT_CLASSES.nav} gap-1`}>
        {WORKSPACE_SPACES.filter((space) => space.id !== 'me').map((space) => {
          const Icon = icons[space.id];
          const active = isWorkspaceActive(pathname, space.href, userId);
          const label = t(space.labelKey);
          return (
            <Link
              key={space.id}
              href={space.href}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-11 items-center text-sm transition-colors before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-[var(--primary)] ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${active ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary-text)] before:opacity-100' : 'text-[var(--text-secondary)] before:opacity-0 hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'}`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
        {!collapsed && contextMode && (
          <ContentNavigation
            mode={contextMode}
            settings={settings}
            isAuthenticated={isAuthenticated}
            userId={userId}
            forumCategories={navigation.forumCategories}
            resourceCategories={navigation.resourceCategories}
            contextOnly
          />
        )}
        {/* Pushed to the bottom of the nav column: on short pages it parks the
            personal entry at the rail's foot without leaving a dead gap, and on
            tall pages it sits directly under the workspace list. */}
        <div className="mt-auto border-t border-[var(--border)] pt-3">
          {!collapsed && (
            <div className="px-3 pb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {t('navigation.personal')}
            </div>
          )}
          <Link
            href={personalSpace.href}
            title={collapsed ? t(personalSpace.labelKey) : undefined}
            aria-label={collapsed ? t(personalSpace.labelKey) : undefined}
            aria-current={personalActive ? 'page' : undefined}
            className={`relative flex min-h-11 items-center text-sm transition-colors before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-[var(--primary)] ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${personalActive ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary-text)] before:opacity-100' : 'text-[var(--text-secondary)] before:opacity-0 hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'}`}
          >
            <PersonalIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{t(personalSpace.labelKey)}</span>}
          </Link>
        </div>
      </nav>
      <div data-testid="sidebar-user" className={SIDEBAR_LAYOUT_CLASSES.user}>
        <SidebarUserPanel userName={userName} userMeta={userMeta} collapsed={collapsed} />
      </div>
    </aside>
  );
}
