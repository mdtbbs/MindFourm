/**
 * Sidebar navigation — resolves admin-configured `sidebar_navigation_items`
 * into a filtered list the sidebar and drawer components can render directly.
 *
 * The backend stores the items as a JSON string under the public setting
 * `sidebar_navigation_items`. Each item carries `enabled`, `requiresAuth`,
 * and an optional `featureKey` that gates visibility on a feature toggle.
 */

export interface SidebarNavigationItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  enabled: boolean;
  requiresAuth: boolean;
  featureKey?: string;
}

export interface SidebarNavigationContext {
  settings: Record<string, string>;
  isAuthenticated: boolean;
}

/**
 * Fallback defaults — kept in sync with the backend's
 * `getDefaultSidebarNavigation()` in
 * `src/common/utils/sidebar-navigation-defaults.ts`.
 */
const DEFAULT_SIDEBAR_NAVIGATION: SidebarNavigationItem[] = [
  { id: 'home', label: '首页', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
  { id: 'categories', label: '分类', href: '/categories', icon: 'Folder', enabled: true, requiresAuth: false },
  { id: 'tags', label: '标签', href: '/tags', icon: 'Tag', enabled: true, requiresAuth: false },
  { id: 'resources', label: '资源中心', href: '/resources', icon: 'Book', enabled: true, requiresAuth: false },
];

const AUTH_ONLY_PREFIXES = ['/notifications', '/messages', '/friends', '/bookmarks', '/settings'];

/**
 * Parse the raw JSON string stored in `sidebar_navigation_items`. Returns an
 * empty array when the value is absent, malformed, or not an array. Items that
 * don't match the expected shape are silently dropped — same strategy as the
 * backend's `normalizeSidebarNavigation`.
 */
export function parseSidebarNavigationItems(rawValue: string | undefined): SidebarNavigationItem[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is SidebarNavigationItem => {
      if (!item || typeof item !== 'object') return false;
      const raw = item as Record<string, unknown>;
      return (
        typeof raw.id === 'string' &&
        typeof raw.label === 'string' &&
        typeof raw.href === 'string' &&
        typeof raw.icon === 'string' &&
        typeof raw.enabled === 'boolean' &&
        typeof raw.requiresAuth === 'boolean'
      );
    });
  } catch {
    return [];
  }
}

function isAnonymousSafeHref(href: string): boolean {
  if (!href.startsWith('/')) {
    return true;
  }
  return !AUTH_ONLY_PREFIXES.some((prefix) => href === prefix || href.startsWith(`${prefix}/`));
}

function isFeatureEnabled(featureKey: string | undefined, settings: Record<string, string>): boolean {
  if (!featureKey) return true;
  const value = settings[featureKey];
  if (value === undefined) return true;
  return !['false', '0', 'no', 'off'].includes(value.toLowerCase());
}

/**
 * Resolve the sidebar navigation items from settings, applying runtime
 * filters for enabled state, authentication, and feature toggles.
 *
 * Falls back to hard-coded defaults when the stored setting is empty or
 * unparseable — mirroring the backend's three-tier resolution in
 * `SettingsService.getSidebarNavigation()`.
 */
export function buildSidebarNavigation(context: SidebarNavigationContext): SidebarNavigationItem[] {
  const parsed = parseSidebarNavigationItems(context.settings.sidebar_navigation_items);
  const items = parsed.length > 0 ? parsed : DEFAULT_SIDEBAR_NAVIGATION;

  return items.filter((item) => {
    if (!item.enabled) return false;

    if (item.requiresAuth && !context.isAuthenticated) return false;

    if (!context.isAuthenticated && !isAnonymousSafeHref(item.href)) return false;

    if (!isFeatureEnabled(item.featureKey, context.settings)) return false;

    return true;
  });
}
