import {
  filterTopNavigationItemsBySettings,
  isHrefEnabled,
  parseTopNavigationItems,
} from './top-navigation';

export type SiteNavLink = {
  label: string;
  href: string;
  newTab?: boolean;
  icon?: string;
  requiresAuth?: boolean;
};

export type SiteNavGroup = {
  label: string;
  items: SiteNavLink[];
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

export type SidebarQuickAction = {
  label: string;
  href?: string;
  action?: 'login' | 'register';
  requiresAuth?: boolean;
  variant: 'primary' | 'secondary';
};

export type SiteNavigationModel = {
  primaryItems: SiteNavLink[];
  groups: SiteNavGroup[];
  personalItems: SiteNavLink[];
  quickActions: SidebarQuickAction[];
};

export type SiteNavigationContext = {
  settings: Record<string, string>;
  isAuthenticated: boolean;
  userRole?: string;
};

const FIXED_PRIMARY_ITEMS: SiteNavLink[] = [
  { label: '首页', href: '/', icon: 'home' },
];

const authenticatedPersonalItems: SiteNavLink[] = [
  { label: '通知', href: '/notifications', icon: 'bell', requiresAuth: true },
  { label: '消息', href: '/messages', icon: 'mail', requiresAuth: true },
  { label: '好友', href: '/friends', icon: 'users', requiresAuth: true },
  { label: '书签', href: '/bookmarks', icon: 'bookmark', requiresAuth: true },
  { label: '设置', href: '/settings', icon: 'settings', requiresAuth: true },
];

const authenticatedQuickActions: SidebarQuickAction[] = [
  { label: '发帖', href: '/posts/new', requiresAuth: true, variant: 'primary' },
  { label: '提交资源', href: '/resources/submit', requiresAuth: true, variant: 'secondary' },
];

const anonymousQuickActions: SidebarQuickAction[] = [
  { label: '登录', action: 'login', variant: 'primary' },
  { label: '注册', action: 'register', variant: 'secondary' },
];

const AUTH_ONLY_PREFIXES = ['/notifications', '/messages', '/friends', '/bookmarks', '/settings'];

function toSiteNavLink(link: { label: string; href: string; newTab?: boolean }): SiteNavLink {
  return {
    label: link.label,
    href: link.href,
    newTab: link.newTab,
  };
}

function isAnonymousSafeHref(href: string): boolean {
  if (!href.startsWith('/')) {
    return true;
  }

  return !AUTH_ONLY_PREFIXES.some((prefix) => href === prefix || href.startsWith(`${prefix}/`));
}

function canSeeConfiguredHref(href: string, context: SiteNavigationContext): boolean {
  if (!isHrefEnabled(href, context.settings)) {
    return false;
  }

  if (context.isAuthenticated) {
    return true;
  }

  return isAnonymousSafeHref(href);
}

export function buildSiteNavigationModel(context: SiteNavigationContext): SiteNavigationModel {
  const configuredItems = filterTopNavigationItemsBySettings(
    parseTopNavigationItems(context.settings.top_navigation_items),
    context.settings,
  );

  const primaryItems = [
    ...FIXED_PRIMARY_ITEMS,
    ...configuredItems
      .filter((item): item is Extract<(typeof configuredItems)[number], { type: 'link' }> => item.type === 'link')
      .map(toSiteNavLink),
  ]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.href === item.href) === index)
    .filter((item) => canSeeConfiguredHref(item.href, context));

  const groups = configuredItems
    .filter((item): item is Extract<(typeof configuredItems)[number], { type: 'group' }> => item.type === 'group')
    .map((group) => ({
      label: group.label,
      items: group.items.map(toSiteNavLink).filter((item) => canSeeConfiguredHref(item.href, context)),
    }))
    .filter((group) => group.items.length > 0);

  const personalItems = context.isAuthenticated
    ? authenticatedPersonalItems.filter((item) => isHrefEnabled(item.href, context.settings))
    : [];

  const quickActions = (context.isAuthenticated ? authenticatedQuickActions : anonymousQuickActions)
    .filter((item) => !item.href || isHrefEnabled(item.href, context.settings));

  return {
    primaryItems,
    groups,
    personalItems,
    quickActions,
  };
}
