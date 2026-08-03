import { BadRequestException } from '@nestjs/common';

export interface FooterFriendlyLinkSetting {
  label: string;
  href: string;
  description?: string;
}

const ABSOLUTE_HTTP_RE = /^https?:\/\//i;
const RELATIVE_PATH_RE = /^\/(?!\/)/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeHref(value: unknown): value is string {
  return typeof value === 'string' && (RELATIVE_PATH_RE.test(value) || ABSOLUTE_HTTP_RE.test(value));
}

export function parseFooterFriendlyLinks(rawValue: string): FooterFriendlyLinkSetting[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue || '[]');
  } catch {
    throw new BadRequestException('footer_friendly_links must be valid JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new BadRequestException('footer_friendly_links must be an array');
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BadRequestException(`footer_friendly_links[${index}] must be an object`);
    }

    const raw = item as Record<string, unknown>;
    if (!isNonEmptyString(raw.label)) {
      throw new BadRequestException(`footer_friendly_links[${index}].label is required`);
    }
    if (!isSafeHref(raw.href)) {
      throw new BadRequestException(`footer_friendly_links[${index}].href must start with / or http(s)://`);
    }

    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    return {
      label: raw.label.trim(),
      href: raw.href.trim(),
      ...(description ? { description } : {}),
    };
  });
}

export function serializeFooterFriendlyLinks(items: FooterFriendlyLinkSetting[]): string {
  return JSON.stringify(items);
}

export function normalizeFooterFriendlyLinks(rawValue: string): string {
  return serializeFooterFriendlyLinks(parseFooterFriendlyLinks(rawValue));
}
