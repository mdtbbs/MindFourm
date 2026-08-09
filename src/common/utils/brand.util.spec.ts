import { resolveBrand, BrandInfo, PublicSettings } from './brand.util';

describe('resolveBrand', () => {
  const defaultSettings: PublicSettings = {
    site_name: '',
    site_tagline: '',
    site_description: '',
    site_logo_url: '',
    site_favicon_url: '',
    sidebar_title: '',
  };

  it('should return neutral defaults for empty settings', () => {
    const brand = resolveBrand(defaultSettings);

    expect(brand.siteName).toBe('社区论坛');
    expect(brand.tagline).toBe('');
    expect(brand.description).toBe('');
    expect(brand.logoUrl).toBe('');
    expect(brand.faviconUrl).toBe('');
    expect(brand.sidebarTitle).toBe('内容导航中心');
  });

  it('should use provided values over defaults', () => {
    const settings: PublicSettings = {
      ...defaultSettings,
      site_name: 'My Forum',
      site_tagline: 'Welcome',
      sidebar_title: 'Navigation',
    };

    const brand = resolveBrand(settings);

    expect(brand.siteName).toBe('My Forum');
    expect(brand.tagline).toBe('Welcome');
    expect(brand.sidebarTitle).toBe('Navigation');
  });

  it('should trim whitespace from values', () => {
    const settings: PublicSettings = {
      ...defaultSettings,
      site_name: '  My Forum  ',
    };

    const brand = resolveBrand(settings);

    expect(brand.siteName).toBe('My Forum');
  });

  it('should fallback to site_tagline when sidebar_title is empty', () => {
    const settings: PublicSettings = {
      ...defaultSettings,
      site_tagline: 'Forum Tagline',
      sidebar_title: '',
    };

    const brand = resolveBrand(settings);

    expect(brand.sidebarTitle).toBe('Forum Tagline');
  });

  it('should never return historical project names', () => {
    const settings: PublicSettings = {
      ...defaultSettings,
      site_name: '',
    };

    const brand = resolveBrand(settings);

    expect(brand.siteName).not.toBe('MindForum');
    expect(brand.siteName).not.toBe('MindFourm');
    expect(brand.siteName).not.toBe('MindBBS');
    expect(brand.siteName).not.toBe('Mindustry');
  });

  it('should prefer explicit sidebar_title over site_tagline fallback', () => {
    const settings: PublicSettings = {
      ...defaultSettings,
      site_tagline: 'Tagline Value',
      sidebar_title: '  Explicit Sidebar  ',
    };

    const brand = resolveBrand(settings);

    expect(brand.sidebarTitle).toBe('Explicit Sidebar');
  });

  it('should trim tagline, description, logoUrl, and faviconUrl', () => {
    const settings: PublicSettings = {
      ...defaultSettings,
      site_tagline: '  tagline  ',
      site_description: '  desc  ',
      site_logo_url: '  https://example.com/logo.png  ',
      site_favicon_url: '  https://example.com/fav.ico  ',
    };

    const brand = resolveBrand(settings);

    expect(brand.tagline).toBe('tagline');
    expect(brand.description).toBe('desc');
    expect(brand.logoUrl).toBe('https://example.com/logo.png');
    expect(brand.faviconUrl).toBe('https://example.com/fav.ico');
  });

  it('should return a BrandInfo with the expected shape', () => {
    const brand = resolveBrand(defaultSettings);

    expect(brand).toHaveProperty('siteName');
    expect(brand).toHaveProperty('tagline');
    expect(brand).toHaveProperty('description');
    expect(brand).toHaveProperty('logoUrl');
    expect(brand).toHaveProperty('faviconUrl');
    expect(brand).toHaveProperty('sidebarTitle');
    expect(Object.keys(brand)).toHaveLength(6);
  });
});
