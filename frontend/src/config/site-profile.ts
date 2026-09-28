export type SiteProfile = 'mdtbbs' | 'mindustry-club';
export type SiteLocale = 'zh-CN' | 'en' | 'ru' | 'ja';

export interface FrontendSiteProfile {
  profile: SiteProfile;
  branding: { siteName: string; shortName: string; description: string };
  localization: { defaultLocale: SiteLocale; supportedLocales: readonly SiteLocale[] };
  verification: { requireEmail: boolean; requirePhoneForWrites: boolean };
  features: Readonly<Record<string, boolean>>;
  navigation: readonly { key: string; href: string; label: string; feature?: string }[];
  portalSections: readonly string[];
}

const profiles: Readonly<Record<SiteProfile, FrontendSiteProfile>> = {
  mdtbbs: {
    profile: 'mdtbbs',
    branding: { siteName: 'MDTBBS', shortName: 'MDTBBS', description: 'Mindustry 中文社区' },
    localization: { defaultLocale: 'zh-CN', supportedLocales: ['zh-CN'] },
    verification: { requireEmail: false, requirePhoneForWrites: true },
    features: { resources: true, servers: true, serversDirectory: true, serverApplications: true, gameVersions: true, lanlink: true, developerFeed: true, phoneVerification: true },
    navigation: [
      { key: 'home', href: '/', label: '首页' },
      { key: 'posts', href: '/posts', label: '讨论' },
      { key: 'resources', href: '/resources', label: '资源', feature: 'resources' },
      { key: 'servers', href: '/servers', label: '服务器', feature: 'servers' },
      { key: 'wiki', href: '/wiki', label: '知识库' },
    ],
    portalSections: ['discussions', 'resources', 'news', 'notices', 'development', 'versions'],
  },
  'mindustry-club': {
    profile: 'mindustry-club',
    branding: { siteName: 'Mindustry Club', shortName: 'Mindustry Club', description: 'A community built by Mindustry players.' },
    localization: { defaultLocale: 'en', supportedLocales: ['en', 'ru', 'ja'] },
    verification: { requireEmail: true, requirePhoneForWrites: false },
    features: { resources: true, servers: false, serversDirectory: true, serverApplications: false, gameVersions: true, lanlink: false, developerFeed: false, phoneVerification: false },
    navigation: [
      { key: 'home', href: '/', label: 'Home' },
      { key: 'posts', href: '/posts', label: 'Discussions' },
      { key: 'resources', href: '/resources', label: 'Resources', feature: 'resources' },
      { key: 'servers', href: '/game-servers', label: 'Servers', feature: 'serversDirectory' },
      { key: 'wiki', href: '/wiki', label: 'Knowledge base' },
    ],
    portalSections: ['trending', 'resources', 'discussions', 'community'],
  },
};

const profileName = (process.env.NEXT_PUBLIC_SITE_PROFILE || 'mdtbbs').toLowerCase() as SiteProfile;
if (!profiles[profileName]) throw new Error(`Unsupported NEXT_PUBLIC_SITE_PROFILE "${profileName}". Supported profiles: ${Object.keys(profiles).join(', ')}`);
export const siteProfile = profiles[profileName];

export function isSiteFeatureEnabled(feature: string): boolean {
  return siteProfile.features[feature] === true;
}
