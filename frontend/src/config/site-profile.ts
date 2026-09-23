export type SiteProfile = 'mdtbbs';

export interface FrontendSiteProfile {
  profile: SiteProfile;
  branding: { siteName: string; shortName: string; description: string };
  features: Readonly<Record<string, boolean>>;
  navigation: readonly { key: string; href: string; label: string; feature?: string }[];
  portalSections: readonly string[];
}

const profiles: Readonly<Record<SiteProfile, FrontendSiteProfile>> = {
  mdtbbs: {
    profile: 'mdtbbs',
    branding: { siteName: 'MDTBBS', shortName: 'MDTBBS', description: 'Mindustry 中文社区' },
    features: { resources: true, servers: true, gameVersions: true, lanlink: true, developerFeed: true },
    navigation: [
      { key: 'home', href: '/', label: '首页' },
      { key: 'posts', href: '/posts', label: '讨论' },
      { key: 'resources', href: '/resources', label: '资源', feature: 'resources' },
      { key: 'servers', href: '/servers', label: '服务器', feature: 'servers' },
      { key: 'wiki', href: '/wiki', label: '知识库' },
    ],
    portalSections: ['discussions', 'resources', 'news', 'notices', 'development', 'versions'],
  },
};

const profileName = (process.env.NEXT_PUBLIC_SITE_PROFILE || 'mdtbbs').toLowerCase() as SiteProfile;
export const siteProfile = profiles[profileName] || profiles.mdtbbs;

export function isSiteFeatureEnabled(feature: string): boolean {
  return siteProfile.features[feature] === true;
}
