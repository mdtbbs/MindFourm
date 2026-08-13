export const SIDEBAR_ICON_WHITELIST = [
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

export type SidebarIconName = (typeof SIDEBAR_ICON_WHITELIST)[number];

export const PROTECTED_SIDEBAR_ITEM_IDS = ['home'] as const;

export interface SidebarNavigationItem {
  id: string;
  label: string;
  href: string;
  icon: SidebarIconName;
  enabled: boolean;
  requiresAuth: boolean;
  featureKey?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSidebarNavigation(
  items: SidebarNavigationItem[],
): ValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  items.forEach((item) => {
    // Check empty label
    if (!item.label || item.label.trim() === '') {
      errors.push(`Item "${item.id}" has empty label`);
    }

    // Check empty href
    if (!item.href || item.href.trim() === '') {
      errors.push(`Item "${item.id}" has empty href`);
    }

    // Check duplicate IDs
    if (seenIds.has(item.id)) {
      errors.push(`Duplicate ID "${item.id}"`);
    }
    seenIds.add(item.id);

    // Check icon whitelist
    if (!SIDEBAR_ICON_WHITELIST.includes(item.icon)) {
      errors.push(
        `Invalid icon "${item.icon}" for item "${item.id}"`,
      );
    }

    // Whitelist: only allow relative paths (starting with /) or https:// URLs
    const isRelative = item.href.startsWith('/');
    const isHttps = item.href.startsWith('https://');
    if (!isRelative && !isHttps) {
      errors.push(
        `Invalid href "${item.href}" for item "${item.id}": must start with / (relative path) or https:// (external URL)`,
      );
    }
  });

  if (items.length > 0) {
    for (const protectedId of PROTECTED_SIDEBAR_ITEM_IDS) {
      const item = items.find((candidate) => candidate.id === protectedId);
      if (item && !item.enabled) errors.push(`Protected item "${protectedId}" cannot be disabled`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeSidebarNavigation(
  input: string | SidebarNavigationItem[] | null | undefined,
): SidebarNavigationItem[] {
  if (!input) return [];

  let items: any;

  if (typeof input === 'string') {
    try {
      items = JSON.parse(input);
    } catch {
      return [];
    }
  } else if (Array.isArray(input)) {
    items = input;
  } else {
    return [];
  }

  if (!Array.isArray(items)) return [];

  return items.filter((item) => {
    return (
      item &&
      typeof item.id === 'string' &&
      typeof item.label === 'string' &&
      typeof item.href === 'string' &&
      typeof item.icon === 'string' &&
      typeof item.enabled === 'boolean' &&
      typeof item.requiresAuth === 'boolean'
    );
  }) as SidebarNavigationItem[];
}
