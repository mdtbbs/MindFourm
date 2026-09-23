import type { Category, ResourceCategory } from '@/types';
import { buildSidebarNavigation, type SidebarNavigationItem } from './sidebar-navigation';
import { groupForumCategories } from './forum-categories';

export type ContentNavigationItem = {
  id: string;
  label: string;
  href: string;
  icon?: string;
  activeMatch?: string;
  indent?: boolean;
  count?: number;
  groupLabel?: string;
};

export type ContentNavigationSection = {
  id: string;
  label?: string;
  collapsible?: boolean;
  items: ContentNavigationItem[];
};

export type ContentNavigationContext = {
  mode: 'forum' | 'resources';
  settings: Record<string, string>;
  isAuthenticated: boolean;
  userId?: number;
  forumCategories: Category[];
  resourceCategories: ResourceCategory[];
};

const ICONS: Record<string, string> = {
  home: 'Home', categories: 'Folder', resources: 'Package', search: 'Search',
  servers: 'Server', tags: 'Tag', notices: 'Bell',
};

function featureEnabled(settings: Record<string, string>, key: string): boolean {
  const value = settings[key];
  return value === undefined || !['false', '0', 'no', 'off'].includes(value.toLowerCase());
}

function configuredItem(item: SidebarNavigationItem): ContentNavigationItem {
  return { id: item.id, label: item.label, href: item.href, icon: ICONS[item.id] || item.icon || 'Link' };
}

/** Builds the shared information architecture consumed by the desktop sidebar and mobile drawer. */
export function buildContentNavigation(context: ContentNavigationContext): ContentNavigationSection[] {
  const configured = buildSidebarNavigation({ settings: context.settings, isAuthenticated: context.isAuthenticated });
  const byId = new Map(configured.map((item) => [item.id, item]));
  const globalItems = configured
    .filter((item) => item.id !== 'resources' || featureEnabled(context.settings, 'feature_resources_enabled'))
    .filter((item) => item.id !== 'servers' || featureEnabled(context.settings, 'feature_servers_enabled'))
    .map(configuredItem);
  if (!byId.has('search')) globalItems.push({ id: 'search', label: '搜索', href: '/search', icon: ICONS.search });
  if (featureEnabled(context.settings, 'feature_servers_enabled') && !byId.has('servers')) {
    globalItems.push({ id: 'servers', label: '服务器', href: '/servers', icon: ICONS.servers });
  }

  const sections: ContentNavigationSection[] = [{ id: 'global', label: 'MDTBBS', items: globalItems }];
  if (context.mode === 'resources' && featureEnabled(context.settings, 'feature_resources_enabled')) {
    const activeCategories = context.resourceCategories.filter((category) => category.is_active);
    const activeIds = new Set(activeCategories.map((category) => category.id));
    const roots = activeCategories.filter((category) => !category.parent_id || !activeIds.has(category.parent_id));
    const categoriesByParent = new Map<number, ResourceCategory[]>();
    activeCategories.forEach((category) => {
      if (category.parent_id && activeIds.has(category.parent_id)) {
        const children = categoriesByParent.get(category.parent_id) || [];
        children.push(category);
        categoriesByParent.set(category.parent_id, children);
      }
    });
    sections.push({
      id: 'context', label: '资源浏览', collapsible: true,
      items: [
        { id: 'all-resources', label: '全部资源', href: '/resources', icon: 'Package', activeMatch: '/resources' },
        ...roots.flatMap((category) => [category, ...(categoriesByParent.get(category.id) || [])]).map((category) => ({
          id: `resource-category-${category.id}`,
          label: category.name,
          href: `/resources?category_id=${category.id}`,
          icon: category.icon || undefined,
          activeMatch: `/resources?category_id=${category.id}`,
          indent: Boolean(category.parent_id),
        })),
      ],
    });
  } else if (context.mode === 'forum') {
    const boards: ContentNavigationItem[] = [{ id: 'all-discussions', label: '全部讨论', href: '/threads', icon: 'MessageSquare', activeMatch: '/threads' }];
    for (const group of groupForumCategories(context.forumCategories)) {
      for (const { category, children } of group.boards) {
        boards.push({ id: `forum-category-${category.id}`, label: category.name, href: `/categories/${category.id}`, icon: category.icon || undefined, activeMatch: `/categories/${category.id}`, count: category.post_count, groupLabel: group.label });
        children.forEach((child) => boards.push({ id: `forum-category-${child.id}`, label: child.name, href: `/categories/${child.id}`, icon: child.icon || undefined, activeMatch: `/categories/${child.id}`, indent: true, count: child.post_count, groupLabel: group.label }));
      }
    }
    sections.push({ id: 'context', label: '讨论板块', collapsible: true, items: boards });
  }

  const discover = configured.filter((item) => ['tags', 'notices'].includes(item.id)).map(configuredItem);
  if (!discover.some((item) => item.href === '/lanlink') && featureEnabled(context.settings, 'feature_lanlink_enabled')) {
    discover.push({ id: 'lanlink', label: '联机', href: '/lanlink', icon: 'Radio' });
  }
  if (discover.length) sections.push({ id: 'discover', label: '发现', items: discover });

  if (context.isAuthenticated) {
    sections.push({ id: 'account', label: '我的', collapsible: true, items: [
      ...(context.userId ? [{ id: 'my-posts', label: '我的帖子', href: `/users/${context.userId}`, icon: 'User' }] : []),
      { id: 'bookmarks', label: '我的收藏', href: '/bookmarks', icon: 'Star' },
      { id: 'messages', label: '私信', href: '/messages', icon: 'Mail' },
      { id: 'notifications', label: '通知', href: '/notifications', icon: 'Bell' },
      { id: 'friends', label: '好友', href: '/friends', icon: 'Users' },
      { id: 'settings', label: '设置', href: '/settings', icon: 'Settings' },
    ] });
  }
  return sections;
}

export function contentNavigationCta(mode: 'forum' | 'resources', settings: Record<string, string> = {}) {
  if (mode === 'resources' && !featureEnabled(settings, 'feature_resources_enabled')) return null;
  return mode === 'resources'
    ? { label: '发布资源', href: '/resources/submit', icon: 'Plus' }
    : { label: '发布主题', href: '/posts/new', icon: 'Plus' };
}
