export type SiteProfile = 'mdtbbs' | 'mindustry-club';

export type SiteLocale = 'zh-CN' | 'en' | 'ru' | 'ja';

export interface SiteConfiguration {
  profile: SiteProfile;
  name: string;
  domain: string;
  branding: { shortName: string; description: string };
  localization: { defaultLocale: SiteLocale; supportedLocales: readonly SiteLocale[] };
  contentLanguages: readonly SiteLocale[];
  features: Readonly<Record<string, boolean>>;
  /** Whether the site exposes the per-user language preference for mixed-language feeds. */
  contentLanguagePreference: boolean;
  verification: { requireEmail: boolean; requirePhoneForWrites: boolean };
  modules: readonly string[];
  navigation: readonly string[];
  portalSections: readonly string[];
  searchProviders: readonly string[];
  videoProviders: readonly string[];
}

export const mdtbbsSite: SiteConfiguration = {
  profile: 'mdtbbs',
  name: 'Mindustry 中文社区',
  domain: 'mdtbbs.cn',
  branding: { shortName: 'MDTBBS', description: 'Mindustry 中文社区' },
  localization: { defaultLocale: 'zh-CN', supportedLocales: ['zh-CN'] },
  contentLanguages: ['en', 'ru', 'ja', 'zh-CN'],
  contentLanguagePreference: false,
  verification: { requireEmail: false, requirePhoneForWrites: true },
  features: {
    resources: true, gameVersions: true, servers: true, serversDirectory: true,
    serverApplications: true, lanlink: true, developerFeed: true, phoneVerification: true,
    resourcePreModeration: true, contentLanguageSearch: false, developers: false, domesticFiling: true,
  },
  modules: ['community', 'mdtbbs'],
  navigation: ['home', 'posts', 'resources', 'servers', 'wiki'],
  portalSections: ['discussions', 'resources', 'news', 'notices', 'development', 'versions'],
  searchProviders: ['users', 'posts', 'resources', 'servers', 'game_versions', 'wiki', 'developer_feed'],
  videoProviders: ['bilibili', 'douyin', 'direct'],
};

export const mindustryClubSite: SiteConfiguration = {
  profile: 'mindustry-club',
  name: 'Mindustry Club',
  domain: 'mindustry.club',
  branding: { shortName: 'Mindustry Club', description: 'A community built by Mindustry players.' },
  localization: { defaultLocale: 'en', supportedLocales: ['en', 'ru', 'ja'] },
  contentLanguages: ['en', 'ru', 'ja', 'zh-CN'],
  contentLanguagePreference: true,
  verification: { requireEmail: true, requirePhoneForWrites: false },
  features: {
    resources: true, gameVersions: true, servers: false, serversDirectory: true,
    serverApplications: false, lanlink: false, developerFeed: false, phoneVerification: false,
    resourcePreModeration: false, contentLanguageSearch: true, developers: true, domesticFiling: false,
  },
  modules: ['community', 'international'],
  navigation: ['home', 'posts', 'resources', 'discover', 'developers', 'servers', 'wiki'],
  portalSections: ['trending', 'resources', 'discussions', 'community'],
  searchProviders: ['users', 'posts', 'resources', 'servers', 'game_versions', 'wiki'],
  videoProviders: ['youtube', 'bilibili', 'direct'],
};

export const SITE_PROFILES: Readonly<Record<SiteProfile, SiteConfiguration>> = {
  mdtbbs: mdtbbsSite,
  'mindustry-club': mindustryClubSite,
};
