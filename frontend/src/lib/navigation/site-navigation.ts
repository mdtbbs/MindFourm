import {
  filterTopNavigationItemsBySettings,
  isDefaultNavigationHref,
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
  /**
   * Resolves a locale key. The model only carries keys; callers render them.
   * When omitted the key is returned unchanged, which keeps non-React callers
   * (and tests) working without a provider.
   */
  translate?: (key: string) => string;
};

const FIXED_PRIMARY_ITEMS: SiteNavLink[] = [
  { label: 'navigation.home', href: '/', icon: 'home' },
];

const authenticatedPersonalItems: SiteNavLink[] = [
  { label: 'navigation.notifications', href: '/notifications', icon: 'bell', requiresAuth: true },
  { label: 'navigation.messages', href: '/messages', icon: 'mail', requiresAuth: true },
  { label: 'navigation.friends', href: '/friends', icon: 'users', requiresAuth: true },
  { label: 'navigation.bookmarks', href: '/bookmarks', icon: 'bookmark', requiresAuth: true },
  { label: 'navigation.settings', href: '/settings', icon: 'settings', requiresAuth: true },
];

const authenticatedQuickActions: SidebarQuickAction[] = [
  { label: 'navigation.publishDiscussion', href: '/posts/new', requiresAuth: true, variant: 'primary' },
  { label: 'navigation.publishResource', href: '/resources/submit', requiresAuth: true, variant: 'secondary' },
];

const anonymousQuickActions: SidebarQuickAction[] = [
  { label: 'navigation.login', action: 'login', variant: 'primary' },
  { label: 'navigation.register', action: 'register', variant: 'secondary' },
];

const AUTH_ONLY_PREFIXES = ['/notifications', '/messages', '/friends', '/bookmarks', '/settings'];

/**
 * Configured entries are operator copy and pass through verbatim. The shipped
 * defaults are stored as locale keys, so they are resolved against the current
 * locale — otherwise an English visitor reads the repository's primary
 * language in the header of every page.
 */
function resolveConfiguredLabel(
  link: { label: string; href: string },
  translate: (key: string) => string,
): string {
  return isDefaultNavigationHref(link.href) ? translate(link.label) : link.label;
}

function toSiteNavLink(
  link: { label: string; href: string; newTab?: boolean },
  translate: (key: string) => string,
): SiteNavLink {
  return {
    label: resolveConfiguredLabel(link, translate),
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
  const translate = context.translate || ((key: string) => key);
  const configuredItems = filterTopNavigationItemsBySettings(
    parseTopNavigationItems(context.settings.top_navigation_items),
    context.settings,
  ).map((item) => item.type === 'group' && translate(item.label) !== item.label
    // Group labels support locale keys when the key resolves; an operator is
    // free to name a group "navigation.notes" verbatim.
    ? { ...item, label: translate(item.label) }
    : item);

  const primaryItems = [
    ...FIXED_PRIMARY_ITEMS,
    ...configuredItems
      .filter((item): item is Extract<(typeof configuredItems)[number], { type: 'link' }> => item.type === 'link')
      .map((item) => toSiteNavLink(item, translate)),
  ]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.href === item.href) === index)
    .filter((item) => canSeeConfiguredHref(item.href, context));

  const groups = configuredItems
    .filter((item): item is Extract<(typeof configuredItems)[number], { type: 'group' }> => item.type === 'group')
    .map((group) => ({
      label: group.label,
      items: group.items.map((item) => toSiteNavLink(item, translate)).filter((item) => canSeeConfiguredHref(item.href, context)),
    }))
    .filter((group) => group.items.length > 0);

  const personalItems = context.isAuthenticated
    ? authenticatedPersonalItems
      .filter((item) => isHrefEnabled(item.href, context.settings))
      .map((item) => ({ ...item, label: translate(item.label) }))
    : [];

  const quickActions = (context.isAuthenticated ? authenticatedQuickActions : anonymousQuickActions)
    .filter((item) => !item.href || isHrefEnabled(item.href, context.settings))
    .map((item) => ({ ...item, label: translate(item.label) }));

  return {
    primaryItems,
    groups,
    personalItems,
    quickActions,
  };
}
