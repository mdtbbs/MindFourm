export const DEFAULT_BRAND_PRIMARY = '#2f80ed';
export const DEFAULT_BRAND_ACCENT = '#dcecff';
export const DEFAULT_BRAND_DESCRIPTION = 'A modern community forum';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function normalizeHexColor(value: string | undefined | null, fallback: string): string {
  if (!value) return fallback;
  const normalized = value.trim();
  return HEX_COLOR_RE.test(normalized) ? normalized : fallback;
}

// ────────────────────────────────────────────────────────────────────────────
// Brand resolution — mirrors src/common/utils/brand.util.ts on the backend.
// Resolves raw public settings to a typed BrandInfo object with neutral
// defaults, so the frontend never hard-codes project names.
// ────────────────────────────────────────────────────────────────────────────

export interface BrandInfo {
  siteName: string;
  tagline: string;
  description: string;
  logoUrl: string;
  faviconUrl: string;
  sidebarTitle: string;
}

const NEUTRAL_DEFAULTS = {
  siteName: '社区论坛',
  sidebarTitle: '内容导航中心',
};

export function resolveBrand(settings: Record<string, string>): BrandInfo {
  const siteName = settings.site_name?.trim() || NEUTRAL_DEFAULTS.siteName;
  const tagline = settings.site_tagline?.trim() || '';
  const description = settings.site_description?.trim() || settings.seo_default_description?.trim() || DEFAULT_BRAND_DESCRIPTION;
  const logoUrl = settings.site_logo_url?.trim() || '';
  const faviconUrl = settings.site_favicon_url?.trim() || '';

  const sidebarTitle =
    settings.sidebar_title?.trim() ||
    settings.site_tagline?.trim() ||
    NEUTRAL_DEFAULTS.sidebarTitle;

  return {
    siteName,
    tagline,
    description,
    logoUrl,
    faviconUrl,
    sidebarTitle,
  };
}

export function resolveTitleSuffix(settings: Record<string, string>): string {
  const configured = settings.seo_title_suffix?.trim();
  return configured || ` | ${resolveBrand(settings).siteName}`;
}

export function buildBrandCssVariables(settings?: Record<string, string> | null): Record<string, string> {
  const primary = normalizeHexColor(settings?.brand_primary, DEFAULT_BRAND_PRIMARY);
  const accent = settings?.brand_accent?.trim();

  return {
    '--primary': primary,
    '--primary-dark': `color-mix(in srgb, ${primary} 82%, black)`,
    '--primary-light': `color-mix(in srgb, ${primary} 72%, white)`,
    '--primary-50': `color-mix(in srgb, ${primary} 8%, white)`,
    '--primary-100': `color-mix(in srgb, ${primary} 16%, white)`,
    '--primary-200': `color-mix(in srgb, ${primary} 28%, white)`,
    '--primary-300': `color-mix(in srgb, ${primary} 42%, white)`,
    '--primary-400': `color-mix(in srgb, ${primary} 58%, white)`,
    '--primary-500': `color-mix(in srgb, ${primary} 78%, white)`,
    '--primary-600': primary,
    '--primary-700': `color-mix(in srgb, ${primary} 84%, black)`,
    '--primary-800': `color-mix(in srgb, ${primary} 70%, black)`,
    '--primary-900': `color-mix(in srgb, ${primary} 58%, black)`,
    '--primary-soft': `color-mix(in srgb, ${primary} 7%, transparent)`,
    '--primary-soft-strong': `color-mix(in srgb, ${primary} 12%, transparent)`,
    '--primary-border-soft': `color-mix(in srgb, ${primary} 22%, transparent)`,
    '--primary-border-strong': `color-mix(in srgb, ${primary} 34%, transparent)`,
    '--accent': HEX_COLOR_RE.test(accent || '')
      ? accent!
      : `color-mix(in srgb, ${primary} 14%, var(--bg-card))`,
    '--title-mod': primary,
    '--badge-lv4-end': primary,
  };
}
