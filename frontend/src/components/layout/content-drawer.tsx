'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Bell, BookOpen, FolderOpen, Home, Mail, Plus, Radio, Settings, Star, UserRound, Users, X, type LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import SidebarUserPanel from '@/components/layout/sidebar-user-panel';
import { getIconComponent } from '@/lib/resource-icons';
import { getForumCategoryColor, groupForumCategories } from '@/lib/navigation/forum-categories';
import type { Category, ResourceCategory } from '@/types';
import type { ContentSidebarMode } from './content-sidebar';

function resolveIcon(name?: string | null): LucideIcon {
  const entry = name ? (LucideIcons as Record<string, unknown>)[name] : undefined;
  return typeof entry === 'function' ? entry as LucideIcon : FolderOpen;
}

function isPathActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export const DRAWER_LAYOUT_CLASSES = {
  panel: 'absolute inset-y-0 left-0 flex w-[85vw] max-w-sm flex-col border-r border-[var(--border)] bg-[var(--bg-card)] shadow-xl',
  brand: 'shrink-0 flex items-center justify-between border-b border-[var(--border)] p-4',
  nav: 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4',
  user: 'shrink-0',
} as const;

function DrawerBoardLink({ category, nested, onClose }: { category: Category; nested?: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const active = pathname === `/categories/${category.id}`;
  const color = getForumCategoryColor(category);
  const Icon = resolveIcon(category.icon);
  return <Link href={`/categories/${category.id}`} onClick={onClose} className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-elevated)] ${nested ? 'ml-3' : ''}`} style={active ? { backgroundColor: `${color}18`, color } : undefined}>
    <span className="flex min-w-0 items-center gap-2"><Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} /><span className="truncate">{category.name}</span></span>
    {category.post_count !== undefined && <span className="shrink-0 text-xs text-[var(--text-muted)]">{category.post_count}</span>}
  </Link>;
}

function ForumDrawer({
  categories,
  userId,
  isAuthenticated,
  onClose,
  showResourceLink = true,
}: {
  categories: Category[];
  userId?: number;
  isAuthenticated: boolean;
  onClose: () => void;
  showResourceLink?: boolean;
}) {
  const pathname = usePathname();
  const linkClass = (active: boolean) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'}`;
  return <>
    <Link href="/posts/new" onClick={onClose} className="mb-2 flex items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />发布主题</Link>
    <Link href="/threads" onClick={onClose} className={linkClass(isPathActive(pathname, '/threads') || pathname === '/')}><Home className="h-4 w-4" />全部讨论</Link>
    {isAuthenticated && <Link href="/bookmarks" onClick={onClose} className={linkClass(isPathActive(pathname, '/bookmarks'))}><Star className="h-4 w-4" />我的收藏</Link>}
    {userId && <Link href={`/users/${userId}`} onClick={onClose} className={linkClass(isPathActive(pathname, `/users/${userId}`))}><UserRound className="h-4 w-4" />我的帖子</Link>}
    {groupForumCategories(categories).map((group) => <section key={group.key} className="mt-4 border-t border-[var(--border)] pt-4">
      <h2 className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">{group.label}</h2>
      {group.boards.map(({ category, children }) => <div key={category.id}><DrawerBoardLink category={category} onClose={onClose} />{children.map((child) => <DrawerBoardLink key={child.id} category={child} nested onClose={onClose} />)}</div>)}
    </section>)}
    <section className="mt-4 border-t border-[var(--border)] pt-4">
      <Link href="/tags" onClick={onClose} className={linkClass(isPathActive(pathname, '/tags'))}><BookOpen className="h-4 w-4" />全部标签</Link>
      {showResourceLink && <Link href="/resources" onClick={onClose} className={linkClass(isPathActive(pathname, '/resources'))}><FolderOpen className="h-4 w-4" />资源中心</Link>}
      <Link href="/lanlink" onClick={onClose} className={linkClass(isPathActive(pathname, '/lanlink'))}><Radio className="h-4 w-4" />联机</Link>
      <Link href="/notices" onClick={onClose} className={linkClass(isPathActive(pathname, '/notices'))}><Bell className="h-4 w-4" />公告</Link>
    </section>
    {isAuthenticated && <section className="mt-4 border-t border-[var(--border)] pt-4">
      <h2 className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">我的</h2>
      <Link href="/messages" onClick={onClose} className={linkClass(isPathActive(pathname, '/messages'))}><Mail className="h-4 w-4" />私信</Link>
      <Link href="/notifications" onClick={onClose} className={linkClass(isPathActive(pathname, '/notifications'))}><Bell className="h-4 w-4" />通知</Link>
      <Link href="/friends" onClick={onClose} className={linkClass(isPathActive(pathname, '/friends'))}><Users className="h-4 w-4" />好友</Link>
      <Link href="/settings" onClick={onClose} className={linkClass(isPathActive(pathname, '/settings'))}><Settings className="h-4 w-4" />设置</Link>
    </section>}
  </>;
}

function ResourceDrawer({ categories, onClose }: { categories: ResourceCategory[]; onClose: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedCategory = params.get('category_id');
  const linkClass = (active: boolean) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? 'bg-[var(--primary-soft)] font-medium text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'}`;
  return <>
    <div className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">资源中心</div>
    <Link href="/resources" onClick={onClose} className={linkClass(pathname === '/resources' && !selectedCategory)}><FolderOpen className="h-4 w-4" />全部资源</Link>
    <Link href="/resources/submit" onClick={onClose} className={linkClass(isPathActive(pathname, '/resources/submit'))}><Plus className="h-4 w-4" />发布资源</Link>
    <section className="mt-4 border-t border-[var(--border)] pt-4"><h2 className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">分类</h2>{categories.map((category) => {
      const Icon = getIconComponent(category.icon || 'Folder');
      return <Link key={category.id} href={`/resources?category_id=${category.id}`} onClick={onClose} className={linkClass(selectedCategory === String(category.id))}><Icon className="h-4 w-4" />{category.name}</Link>;
    })}</section>
  </>;
}

export default function ContentDrawer({
  open,
  mode,
  onClose,
  siteName,
  sidebarTitle,
  logoUrl,
  sidebarLogoUrl,
  userName,
  userId,
  isAuthenticated,
  userMeta,
  resourceCategories = [],
  forumCategories = [],
}: {
  open: boolean;
  mode: ContentSidebarMode;
  onClose: () => void;
  siteName: string;
  sidebarTitle?: string;
  logoUrl?: string;
  sidebarLogoUrl?: string;
  userName?: string;
  userId?: number;
  isAuthenticated: boolean;
  userMeta?: string;
  resourceCategories?: ResourceCategory[];
  forumCategories?: Category[];
}) {
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  if (!open) return null;
  const subtitle = mode === 'resources' ? '资源中心' : sidebarTitle;
  const displayLogoUrl = sidebarLogoUrl || logoUrl;

  return <div data-testid="mobile-drawer" className="fixed inset-0 z-[60] lg:hidden">
    <button type="button" aria-label="关闭导航菜单" className="absolute inset-0 bg-black/40" onClick={onClose} />
    <div className={DRAWER_LAYOUT_CLASSES.panel}>
      <div data-testid="mobile-drawer-brand" className={DRAWER_LAYOUT_CLASSES.brand}>
        <Link href="/" onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
          {displayLogoUrl ? (
            <img src={displayLogoUrl} alt={siteName} className="h-8 w-auto max-w-full object-contain" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">{siteName.slice(0, 1)}</div>
          )}
          {!displayLogoUrl && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--text)]">{siteName}</div>
              {subtitle && <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>}
            </div>
          )}
        </Link>
        <button type="button" aria-label="关闭" className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>
      <nav data-testid="mobile-drawer-nav" className={DRAWER_LAYOUT_CLASSES.nav}>
        {mode === 'resources' && <ResourceDrawer categories={resourceCategories} onClose={onClose} />}
        {mode === 'resources' && <section className="mt-5 border-t border-[var(--border)] pt-4"><h2 className="px-3 pb-2 text-[11px] font-medium tracking-wider text-[var(--text-muted)]">论坛</h2></section>}
        <ForumDrawer categories={forumCategories} userId={userId} isAuthenticated={isAuthenticated} onClose={onClose} showResourceLink={mode !== 'resources'} />
      </nav>
      <div data-testid="mobile-drawer-user" className={DRAWER_LAYOUT_CLASSES.user}><SidebarUserPanel userName={userName} userMeta={userMeta} /></div>
    </div>
  </div>;
}
