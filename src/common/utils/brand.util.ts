export interface BrandInfo {
  siteName: string;
  tagline: string;
  description: string;
  logoUrl: string;
  faviconUrl: string;
  sidebarTitle: string;
}

export interface PublicSettings {
  site_name: string;
  site_tagline: string;
  site_description: string;
  site_logo_url: string;
  site_favicon_url: string;
  sidebar_title: string;
}

const NEUTRAL_DEFAULTS = {
  siteName: 'MDTBBS',
  sidebarTitle: '内容导航中心',
};

export function resolveBrand(settings: PublicSettings): BrandInfo {
  const siteName = settings.site_name?.trim() || NEUTRAL_DEFAULTS.siteName;
  const tagline = settings.site_tagline?.trim() || '';
  const description = settings.site_description?.trim() || '';
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
