export interface FooterFriendlyLink {
  label: string;
  href: string;
  description?: string;
}

export interface FooterSettingsViewModel {
  copyright: string;
  icpNumber: string;
  icpUrl: string;
  policeNumber: string;
  policeUrl: string;
  friendlyLinks: FooterFriendlyLink[];
}

const ABSOLUTE_HTTP_RE = /^https?:\/\//i;
const RELATIVE_PATH_RE = /^\/(?!\/)/;

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isSafeFooterHref(value: unknown): value is string {
  return typeof value === 'string' && (RELATIVE_PATH_RE.test(value) || ABSOLUTE_HTTP_RE.test(value));
}

export function isExternalHref(href: string): boolean {
  return ABSOLUTE_HTTP_RE.test(href);
}

export function parseFooterFriendlyLinks(rawValue: unknown): FooterFriendlyLink[] {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item): FooterFriendlyLink | null => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const raw = item as Record<string, unknown>;
        const label = trim(raw.label);
        const href = trim(raw.href);
        const description = trim(raw.description);
        if (!label || !isSafeFooterHref(href)) {
          return null;
        }

        return {
          label,
          href,
          ...(description ? { description } : {}),
        };
      })
      .filter((item): item is FooterFriendlyLink => item !== null);
  } catch {
    return [];
  }
}

export function serializeFooterFriendlyLinks(links: FooterFriendlyLink[]): string {
  const normalized = links
    .map((link) => ({
      label: trim(link.label),
      href: trim(link.href),
      description: trim(link.description),
    }))
    .filter((link) => link.label && isSafeFooterHref(link.href))
    .map((link) => ({
      label: link.label,
      href: link.href,
      ...(link.description ? { description: link.description } : {}),
    }));

  return JSON.stringify(normalized, null, 2);
}

export function getFooterSettings(settings: Record<string, string>): FooterSettingsViewModel {
  const siteName = trim(settings.site_name) || 'MindForum';
  const currentYear = new Date().getFullYear();
  const copyright =
    trim(settings.footer_copyright) ||
    trim(settings.site_footer) ||
    `© ${currentYear} ${siteName}. All rights reserved.`;

  return {
    copyright,
    icpNumber: trim(settings.footer_icp_number),
    icpUrl: isSafeFooterHref(settings.footer_icp_url) ? trim(settings.footer_icp_url) : '',
    policeNumber: trim(settings.footer_police_number),
    policeUrl: isSafeFooterHref(settings.footer_police_url) ? trim(settings.footer_police_url) : '',
    friendlyLinks: parseFooterFriendlyLinks(settings.footer_friendly_links),
  };
}
