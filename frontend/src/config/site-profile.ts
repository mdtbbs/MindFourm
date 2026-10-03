export type SiteProfile = 'mdtbbs' | 'mindustry-club';
export type SiteLocale = 'zh-CN' | 'en' | 'ru' | 'ja';

export interface FrontendSiteProfile {
  profile: SiteProfile;
  domain: string;
  branding: { siteName: string; shortName: string; description: string };
  localization: { defaultLocale: SiteLocale; supportedLocales: readonly SiteLocale[] };
  contentLanguages: readonly SiteLocale[];
  contentLanguagePreference: boolean;
  verification: { requireEmail: boolean; requirePhoneForWrites: boolean };
  features: Readonly<Record<string, boolean>>;
  navigation: readonly { key: string; href: string; label: string; feature?: string }[];
  portalSections: readonly string[];
  videoProviders: readonly ('youtube' | 'bilibili' | 'douyin' | 'direct')[];
}

const profiles: Readonly<Record<SiteProfile, FrontendSiteProfile>> = {
  mdtbbs: {
    profile: 'mdtbbs',
    domain: 'mdtbbs.cn',
    branding: { siteName: 'MDTBBS', shortName: 'MDTBBS', description: 'Mindustry 中文社区' },
    localization: { defaultLocale: 'zh-CN', supportedLocales: ['zh-CN'] },
    contentLanguages: ['en', 'ru', 'ja', 'zh-CN'],
    contentLanguagePreference: false,
    verification: { requireEmail: false, requirePhoneForWrites: true },
    features: { resources: true, servers: true, serversDirectory: true, serverApplications: true, gameVersions: true, lanlink: true, developerFeed: true, phoneVerification: true, domesticFiling: true, contentLanguageSearch: false, developers: false },
    navigation: [
      { key: 'home', href: '/', label: '首页' },
      { key: 'posts', href: '/posts', label: '讨论' },
      { key: 'resources', href: '/resources', label: '资源', feature: 'resources' },
      { key: 'servers', href: '/servers', label: '服务器', feature: 'servers' },
      { key: 'wiki', href: '/wiki', label: '知识库' },
    ],
    portalSections: ['discussions', 'resources', 'news', 'notices', 'development', 'versions'],
    videoProviders: ['bilibili', 'douyin', 'direct'],
  },
  'mindustry-club': {
    profile: 'mindustry-club',
    domain: 'mindustry.club',
    branding: { siteName: 'Mindustry Club', shortName: 'Mindustry Club', description: 'A community built by Mindustry players.' },
    localization: { defaultLocale: 'en', supportedLocales: ['en', 'ru', 'ja'] },
    contentLanguages: ['en', 'ru', 'ja', 'zh-CN'],
    contentLanguagePreference: true,
    verification: { requireEmail: true, requirePhoneForWrites: false },
    features: { resources: true, servers: false, serversDirectory: true, serverApplications: false, gameVersions: true, lanlink: false, developerFeed: false, phoneVerification: false, domesticFiling: false, contentLanguageSearch: true, developers: true },
    navigation: [
      { key: 'home', href: '/', label: 'Home' },
      { key: 'posts', href: '/threads', label: 'Discussions' },
      { key: 'resources', href: '/resources', label: 'Resources', feature: 'resources' },
      { key: 'discover', href: '/discover', label: 'Discover' },
      { key: 'developers', href: '/developers', label: 'Developers', feature: 'developers' },
      { key: 'servers', href: '/servers', label: 'Servers', feature: 'serversDirectory' },
      { key: 'wiki', href: '/wiki', label: 'Knowledge base' },
    ],
    portalSections: ['trending', 'resources', 'discussions', 'community'],
    videoProviders: ['youtube', 'bilibili', 'direct'],
  },
};

const profileName = (process.env.NEXT_PUBLIC_SITE_PROFILE || 'mdtbbs').toLowerCase() as SiteProfile;
if (!profiles[profileName]) throw new Error(`Unsupported NEXT_PUBLIC_SITE_PROFILE "${profileName}". Supported profiles: ${Object.keys(profiles).join(', ')}`);
export const siteProfile = profiles[profileName];

export function isSiteFeatureEnabled(feature: string): boolean {
  return siteProfile.features[feature] === true;
}
