/**
 * Sidebar navigation — resolves admin-configured `sidebar_navigation_items`
 * into a filtered list the sidebar and drawer components can render directly.
 *
 * The backend stores the items as a JSON string under the public setting
 * `sidebar_navigation_items`. Each item carries `enabled`, `requiresAuth`,
 * and an optional `featureKey` that gates visibility on a feature toggle.
 */

/**
 * Icon whitelist — must stay in sync with the backend's
 * `SIDEBAR_ICON_WHITELIST` in `src/common/utils/sidebar-navigation.util.ts`.
 */
export const SIDEBAR_ICON_OPTIONS = [
  'Home',
  'Search',
  'Folder',
  'Tag',
  'Users',
  'MessageSquare',
  'Bell',
  'Settings',
  'Shield',
  'Book',
  'FileText',
  'Image',
  'Video',
  'Music',
  'Calendar',
  'Map',
  'Star',
  'Heart',
  'TrendingUp',
  'ExternalLink',
  'Link',
  'HelpCircle',
  'Info',
  'Mail',
  'ShoppingCart',
  'Gift',
  'Award',
  'User',
  'LogIn',
  'LogOut',
] as const;

export type SidebarIconName = (typeof SIDEBAR_ICON_OPTIONS)[number];

const ICON_SET: Set<string> = new Set<string>(SIDEBAR_ICON_OPTIONS);

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
  /** Resolves a default item's locale key. Defaults to identity. */
  translate?: (key: string) => string;
}

/**
 * Fallback defaults — kept in sync with the backend's
 * `getDefaultSidebarNavigation()` in
 * `src/common/utils/sidebar-navigation-defaults.ts`.
 *
 * `label` is a locale key, not display copy: `buildSidebarNavigation` resolves
 * it and every consumer receives rendered text. Operators who edit the sidebar
 * in the admin console store their own literal labels, which take precedence.
 */
export const DEFAULT_SIDEBAR_NAVIGATION: SidebarNavigationItem[] = [
  { id: 'home', label: 'navigation.home', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
  { id: 'categories', label: 'navigation.categories', href: '/categories', icon: 'Folder', enabled: true, requiresAuth: false },
  { id: 'tags', label: 'navigation.tags', href: '/tags', icon: 'Tag', enabled: true, requiresAuth: false },
  { id: 'resources', label: 'navigation.resources', href: '/resources', icon: 'Book', enabled: true, requiresAuth: false },
  { id: 'notices', label: 'navigation.announcements', href: '/notices', icon: 'Bell', enabled: true, requiresAuth: false },
];

/** Locale keys for the shipped defaults, so "Reset to defaults" previews read naturally. */
export const DEFAULT_SIDEBAR_NAVIGATION_KEYS = new Set(
  DEFAULT_SIDEBAR_NAVIGATION.map((item) => item.label),
);

/**
 * True when `label` is one of the shipped locale keys. Those are resolved
 * against the active locale; anything else is operator copy and is kept as-is.
 */
export function isDefaultSidebarLabel(label: string): boolean {
  return DEFAULT_SIDEBAR_NAVIGATION_KEYS.has(label);
}

const PROTECTED_SIDEBAR_ITEM_IDS = new Set(['home']);

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
  const configuredItems = parsed.length > 0 ? parsed : DEFAULT_SIDEBAR_NAVIGATION;
  const items = configuredItems.map((item) => item.id === 'home' ? { ...item, enabled: true } : item);
  const defaultHome = DEFAULT_SIDEBAR_NAVIGATION.find((item) => item.id === 'home')!;
  const defaultNotices = DEFAULT_SIDEBAR_NAVIGATION.find((item) => item.id === 'notices')!;
  if (!items.some((item) => item.id === 'home')) items.unshift(defaultHome);
  if (!items.some((item) => item.id === 'notices')) items.splice(1, 0, defaultNotices);

  const translate = context.translate || ((key: string) => key);

  return items
    .filter((item) => {
      if (!item.enabled) return false;

      if (item.requiresAuth && !context.isAuthenticated) return false;

      if (!context.isAuthenticated && !isAnonymousSafeHref(item.href)) return false;

      if (!isFeatureEnabled(item.featureKey, context.settings)) return false;

      return true;
    })
    .map((item) => (isDefaultSidebarLabel(item.label) ? { ...item, label: translate(item.label) } : item));
}

// ─── Editor validation ──────────────────────────────────────────────────────

export interface SidebarValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Client-side validation mirroring the backend `validateSidebarNavigation`.
 * Used by the navigation editor to show instant feedback before saving.
 */
export function validateSidebarNavigation(
  items: SidebarNavigationItem[],
): SidebarValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  items.forEach((item) => {
    if (!item.label || item.label.trim() === '') {
      errors.push(`Item "${item.id}": label must not be empty`);
    }

    if (!item.href || item.href.trim() === '') {
      errors.push(`Item "${item.id}": link must not be empty`);
    }

    if (seenIds.has(item.id)) {
      errors.push(`Duplicate item id "${item.id}"`);
    }
    seenIds.add(item.id);

    if (!ICON_SET.has(item.icon)) {
      errors.push(`Item "${item.id}": unsupported icon "${item.icon}"`);
    }

    if (typeof item.href === 'string' && item.href.trim() !== '') {
      const isRelative = item.href.startsWith('/');
      const isHttps = item.href.startsWith('https://');
      if (!isRelative && !isHttps) {
        errors.push(`Item "${item.id}": link must start with / or https://`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
}
