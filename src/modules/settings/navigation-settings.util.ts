import { BadRequestException } from '@nestjs/common';

export interface TopNavigationLinkSetting {
  label: string;
  href: string;
  newTab?: boolean;
}

export type TopNavigationItemSetting =
  | {
      type: 'link';
      label: string;
      href: string;
      newTab?: boolean;
    }
  | {
      type: 'group';
      label: string;
      items: TopNavigationLinkSetting[];
    };

export const DEFAULT_BRAND_PRIMARY = '#2f80ed';
export const DEFAULT_BRAND_ACCENT = '#dcecff';

export const DEFAULT_TOP_NAVIGATION_ITEMS: TopNavigationItemSetting[] = [
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
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ABSOLUTE_HTTP_RE = /^https?:\/\//i;
const RELATIVE_PATH_RE = /^\/(?!\/)/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeNavigationHref(value: unknown): value is string {
  return typeof value === 'string' && (RELATIVE_PATH_RE.test(value) || ABSOLUTE_HTTP_RE.test(value));
}

function normalizeNewTab(value: unknown): boolean | undefined {
  return value === true ? true : undefined;
}

function normalizeNavigationLink(input: unknown, path: string): TopNavigationLinkSetting {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException(`${path} must be an object`);
  }

  const raw = input as Record<string, unknown>;
  if (!isNonEmptyString(raw.label)) {
    throw new BadRequestException(`${path}.label is required`);
  }
  if (!isSafeNavigationHref(raw.href)) {
    throw new BadRequestException(`${path}.href must start with / or http(s)://`);
  }

  return {
    label: raw.label.trim(),
    href: raw.href.trim(),
    newTab: normalizeNewTab(raw.newTab),
  };
}

export function parseTopNavigationItems(rawValue: string): TopNavigationItemSetting[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new BadRequestException('top_navigation_items must be valid JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new BadRequestException('top_navigation_items must be an array');
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BadRequestException(`top_navigation_items[${index}] must be an object`);
    }

    const raw = item as Record<string, unknown>;
    if (!isNonEmptyString(raw.label)) {
      throw new BadRequestException(`top_navigation_items[${index}].label is required`);
    }

    if (raw.type === 'group') {
      if (!Array.isArray(raw.items) || raw.items.length === 0) {
        throw new BadRequestException(`top_navigation_items[${index}].items must be a non-empty array`);
      }

      return {
        type: 'group' as const,
        label: raw.label.trim(),
        items: raw.items.map((child, childIndex) =>
          normalizeNavigationLink(child, `top_navigation_items[${index}].items[${childIndex}]`),
        ),
      };
    }

    return {
      type: 'link' as const,
      ...normalizeNavigationLink(raw, `top_navigation_items[${index}]`),
    };
  });
}

export function assertValidColorSetting(key: string, value: string): void {
  if (!HEX_COLOR_RE.test(value.trim())) {
    throw new BadRequestException(`${key} must be a 6-digit hex color`);
  }
}

export function serializeTopNavigationItems(items: TopNavigationItemSetting[]): string {
  return JSON.stringify(items);
}
