'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Bell, BookOpen, FolderOpen, Home, Mail, Plus, Radio, Settings, Star, UserRound, Users, type LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import SidebarUserPanel from '@/components/layout/sidebar-user-panel';
import { getIconComponent } from '@/lib/resource-icons';
import { getForumCategoryColor, groupForumCategories } from '@/lib/navigation/forum-categories';
import type { Category, ResourceCategory } from '@/types';

export type ContentSidebarMode = 'forum' | 'resources';

function resolveIcon(name?: string | null): LucideIcon {
  const entry = name ? (LucideIcons as Record<string, unknown>)[name] : undefined;
  return typeof entry === 'function' ? entry as LucideIcon : FolderOpen;
}

function isPathActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Layout tokens are exported for the lightweight layout spec. */
export const SIDEBAR_LAYOUT_CLASSES = {
  root: 'hidden w-56 shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)] lg:flex lg:h-[100dvh] lg:flex-col lg:sticky lg:top-0 lg:overflow-hidden',
  brand: 'shrink-0 border-b border-[var(--border)] p-4',
  nav: 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4',
  user: 'shrink-0',
} as const;

function SidebarBrand({ siteName, subtitle, logoUrl }: { siteName: string; subtitle?: string; logoUrl?: string }) {
  return (
    <div data-testid="sidebar-brand" className={SIDEBAR_LAYOUT_CLASSES.brand}>
      <Link href="/" className="flex items-center gap-3">
        {logoUrl ? <img src={logoUrl} alt={siteName} className="h-8 max-w-[128px] object-contain" /> : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">{siteName.slice(0, 1)}</div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text)]">{siteName}</div>
          {subtitle && <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>}
        </div>
      </Link>
    </div>
  );
}

function ForumBoardLink({ category, nested = false }: { category: Category; nested?: boolean }) {
  const pathname = usePathname();
  const active = pathname === `/categories/${category.id}`;
  const color = getForumCategoryColor(category);
  const Icon = resolveIcon(category.icon);

  return (
    <Link
      href={`/categories/${category.id}`}
      className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-elevated)] ${nested ? 'ml-3' : ''}`}
      style={active ? { backgroundColor: `${color}18`, color } : undefined}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
        <span className="truncate">{category.name}</span>
      </span>
      {category.post_count !== undefined && <span className="shrink-0 text-xs text-[var(--text-muted)]">{category.post_count}</span>}
    </Link>
  );
}

function ForumSidebar({
  categories,
  userId,
  isAuthenticated,
  showResourceLink = true,
}: {
  categories: Category[];
  userId?: number;
  isAuthenticated: boolean;
  showResourceLink?: boolean;
}) {
  const pathname = usePathname();
  const groups = groupForumCategories(categories);
  const navItemClass = (active: boolean) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'}`;

  return (
    <>
      <Link href="/posts/new" className="mb-2 flex items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-dark)]">
        <Plus className="h-4 w-4" /> 发布主题
      </Link>
      <div className="space-y-1">
        <Link href="/threads" className={navItemClass(isPathActive(pathname, '/threads') || pathname === '/')}><Home className="h-4 w-4" />全部讨论</Link>
        {isAuthenticated && <Link href="/bookmarks" className={navItemClass(isPathActive(pathname, '/bookmarks'))}><Star className="h-4 w-4" />我的收藏</Link>}
        {userId && <Link href={`/users/${userId}`} className={navItemClass(isPathActive(pathname, `/users/${userId}`))}><UserRound className="h-4 w-4" />我的帖子</Link>}
      </div>

      {groups.length > 0 && <div className="mt-4 border-t border-[var(--border)] pt-4">
        {groups.map((group) => (
          <section key={group.key} className="mb-5 last:mb-0">
            <h2 className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">{group.label}</h2>
            <div className="space-y-0.5">
              {group.boards.map(({ category, children }) => <div key={category.id}>
                <ForumBoardLink category={category} />
                {children.map((child) => <ForumBoardLink key={child.id} category={child} nested />)}
              </div>)}
            </div>
          </section>
        ))}
      </div>}

      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <Link href="/tags" className={navItemClass(isPathActive(pathname, '/tags'))}><BookOpen className="h-4 w-4" />全部标签</Link>
        {showResourceLink && <Link href="/resources" className={navItemClass(isPathActive(pathname, '/resources'))}><FolderOpen className="h-4 w-4" />资源中心</Link>}
        <Link href="/lanlink" className={navItemClass(isPathActive(pathname, '/lanlink'))}><Radio className="h-4 w-4" />联机</Link>
        <Link href="/notices" className={navItemClass(isPathActive(pathname, '/notices'))}><Bell className="h-4 w-4" />公告</Link>
      </div>
      {isAuthenticated && <section className="mt-4 border-t border-[var(--border)] pt-4">
        <h2 className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">我的</h2>
        <Link href="/messages" className={navItemClass(isPathActive(pathname, '/messages'))}><Mail className="h-4 w-4" />私信</Link>
        <Link href="/notifications" className={navItemClass(isPathActive(pathname, '/notifications'))}><Bell className="h-4 w-4" />通知</Link>
        <Link href="/friends" className={navItemClass(isPathActive(pathname, '/friends'))}><Users className="h-4 w-4" />好友</Link>
        <Link href="/settings" className={navItemClass(isPathActive(pathname, '/settings'))}><Settings className="h-4 w-4" />设置</Link>
      </section>}
    </>
  );
}

function ResourceSidebar({ categories }: { categories: ResourceCategory[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get('category_id');
  const activeBase = pathname === '/resources' && !selectedCategory;

  return (
    <>
      <div className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">资源中心</div>
      <Link href="/resources" className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${activeBase ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'}`}><FolderOpen className="h-4 w-4" />全部资源</Link>
      <Link href="/resources/submit" className="mt-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"><Plus className="h-4 w-4" />发布资源</Link>
      <section className="mt-4 border-t border-[var(--border)] pt-4">
        <h2 className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">分类</h2>
        <div className="space-y-0.5">
          {categories.map((category) => {
            const Icon = getIconComponent(category.icon || 'Folder');
            const active = selectedCategory === String(category.id);
            return <Link key={category.id} href={`/resources?category_id=${category.id}`} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'}`}><Icon className="h-4 w-4" />{category.name}</Link>;
          })}
        </div>
      </section>
    </>
  );
}

export default function ContentSidebar({
  mode,
  siteName,
  sidebarTitle,
  logoUrl,
  userName,
  userId,
  isAuthenticated,
  userMeta,
  resourceCategories = [],
  forumCategories = [],
}: {
  mode: ContentSidebarMode;
  siteName: string;
  sidebarTitle?: string;
  logoUrl?: string;
  userName?: string;
  userId?: number;
  isAuthenticated: boolean;
  userMeta?: string;
  resourceCategories?: ResourceCategory[];
  forumCategories?: Category[];
}) {
  const subtitle = mode === 'resources' ? '资源中心' : sidebarTitle;
  return (
    <aside data-testid="content-sidebar" className={SIDEBAR_LAYOUT_CLASSES.root}>
      <SidebarBrand siteName={siteName} subtitle={subtitle} logoUrl={logoUrl} />
      <nav data-testid="sidebar-nav" aria-label="站点导航" className={SIDEBAR_LAYOUT_CLASSES.nav}>
        {mode === 'resources' && <ResourceSidebar categories={resourceCategories} />}
        {mode === 'resources' && <div className="mt-5 border-t border-[var(--border)] pt-4"><h2 className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">论坛</h2></div>}
        <ForumSidebar categories={forumCategories} userId={userId} isAuthenticated={isAuthenticated} showResourceLink={mode !== 'resources'} />
      </nav>
      <div data-testid="sidebar-user" className={SIDEBAR_LAYOUT_CLASSES.user}><SidebarUserPanel userName={userName} userMeta={userMeta} /></div>
    </aside>
  );
}
