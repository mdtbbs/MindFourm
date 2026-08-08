export interface TopNavigationLink {
  label: string;
  href: string;
  newTab?: boolean;
}

export type TopNavigationItem =
  | {
      type: 'link';
      label: string;
      href: string;
      newTab?: boolean;
    }
  | {
      type: 'group';
      label: string;
      items: TopNavigationLink[];
    };

export const DEFAULT_TOP_NAVIGATION_ITEMS: TopNavigationItem[] = [
  { type: 'link', label: '资源中心', href: '/resources' },
  {
    type: 'group',
    label: '社区',
    items: [
      { label: '用户组', href: '/groups' },
      { label: '积分排行', href: '/leaderboard' },
      { label: '积分商店', href: '/shop' },
    ],
  },
  { type: 'link', label: 'LanLink', href: '/lanlink' },
];

const FEATURE_SETTING_BY_HREF: Record<string, { key: string; defaultEnabled: boolean }> = {
  '/resources': { key: 'feature_resources_enabled', defaultEnabled: true },
  '/servers': { key: 'feature_servers_enabled', defaultEnabled: false },
  '/groups': { key: 'feature_groups_enabled', defaultEnabled: true },
  '/leaderboard': { key: 'feature_leaderboard_enabled', defaultEnabled: true },
  '/shop': { key: 'feature_shop_enabled', defaultEnabled: true },
  '/lanlink': { key: 'feature_lanlink_enabled', defaultEnabled: false },
};

function isSafeHref(value: unknown): value is string {
  return typeof value === 'string' && (/^\/(?!\/)/.test(value) || /^https?:\/\//i.test(value));
}

function isEnabledSetting(value: string | undefined, defaultEnabled: boolean): boolean {
  if (value === undefined) {
    return defaultEnabled;
  }
  return !['false', '0', 'no', 'off'].includes(value.toLowerCase());
}

function getFeatureByHref(href: string) {
  const direct = FEATURE_SETTING_BY_HREF[href];
  if (direct) {
    return direct;
  }

  if (!href.startsWith('/')) {
    return undefined;
  }

  return Object.entries(FEATURE_SETTING_BY_HREF).find(([prefix]) => href === prefix || href.startsWith(`${prefix}/`))?.[1];
}

export function isHrefEnabled(href: string, settings: Record<string, string> | undefined): boolean {
  const feature = getFeatureByHref(href);
  if (!feature) {
    return true;
  }

  return isEnabledSetting(settings?.[feature.key], feature.defaultEnabled);
}

export function parseTopNavigationItems(rawValue: string | undefined): TopNavigationItem[] {
  if (!rawValue) {
    return DEFAULT_TOP_NAVIGATION_ITEMS;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return DEFAULT_TOP_NAVIGATION_ITEMS;
    }

    const normalized = parsed.flatMap((item): TopNavigationItem[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return [];
      }

      const raw = item as Record<string, unknown>;
      const label = typeof raw.label === 'string' ? raw.label.trim() : '';
      if (!label) {
        return [];
      }

      if (raw.type === 'group') {
        const items = Array.isArray(raw.items)
          ? raw.items.flatMap((child) => {
              if (!child || typeof child !== 'object' || Array.isArray(child)) {
                return [];
              }
              const childRaw = child as Record<string, unknown>;
              const childLabel = typeof childRaw.label === 'string' ? childRaw.label.trim() : '';
              const childHref = childRaw.href;
              if (!childLabel || !isSafeHref(childHref)) {
                return [];
              }
              return [{
                label: childLabel,
                href: childHref.trim(),
                newTab: childRaw.newTab === true ? true : undefined,
              } satisfies TopNavigationLink];
            })
          : [];

        return items.length > 0
          ? [{ type: 'group', label, items } satisfies TopNavigationItem]
          : [];
      }

      if (!isSafeHref(raw.href)) {
        return [];
      }

      return [{
        type: 'link',
        label,
        href: raw.href.trim(),
        newTab: raw.newTab === true ? true : undefined,
      } satisfies TopNavigationItem];
    });

    return normalized.length > 0 ? normalized : DEFAULT_TOP_NAVIGATION_ITEMS;
  } catch {
    return DEFAULT_TOP_NAVIGATION_ITEMS;
  }
}

export function filterTopNavigationItemsBySettings(
  items: TopNavigationItem[],
  settings: Record<string, string> | undefined,
): TopNavigationItem[] {
  const currentSettings = settings || {};

  return items.flatMap((item): TopNavigationItem[] => {
    if (item.type === 'group') {
      const visibleItems = item.items.filter((child) => isHrefEnabled(child.href, currentSettings));
      return visibleItems.length > 0 ? [{ ...item, items: visibleItems }] : [];
    }

    return isHrefEnabled(item.href, currentSettings) ? [item] : [];
  });
}
