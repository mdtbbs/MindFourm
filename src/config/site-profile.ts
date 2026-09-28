import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SiteProfile = 'mdtbbs' | 'mindustry-club';

export type SiteLocale = 'zh-CN' | 'en' | 'ru' | 'ja';

export interface SiteConfiguration {
  profile: SiteProfile;
  name: string;
  domain: string;
  branding: { shortName: string; description: string };
  localization: { defaultLocale: SiteLocale; supportedLocales: readonly SiteLocale[] };
  verification: { requireEmail: boolean; requirePhoneForWrites: boolean };
  features: Readonly<Record<string, boolean>>;
  modules: readonly string[];
  navigation: readonly string[];
  portalSections: readonly string[];
  searchProviders: readonly string[];
}

export const mdtbbsSite: SiteConfiguration = {
  profile: 'mdtbbs',
  name: 'Mindustry 中文社区',
  domain: 'mdtbbs.cn',
  branding: { shortName: 'MDTBBS', description: 'Mindustry 中文社区' },
  localization: { defaultLocale: 'zh-CN', supportedLocales: ['zh-CN'] },
  verification: { requireEmail: false, requirePhoneForWrites: true },
  features: {
    resources: true, gameVersions: true, servers: true, serversDirectory: true,
    serverApplications: true, lanlink: true, developerFeed: true, phoneVerification: true,
    resourcePreModeration: true,
  },
  modules: ['community', 'mdtbbs'],
  navigation: ['home', 'posts', 'resources', 'servers', 'wiki'],
  portalSections: ['discussions', 'resources', 'news', 'notices', 'development', 'versions'],
  searchProviders: ['users', 'posts', 'resources', 'servers', 'game_versions', 'wiki', 'developer_feed'],
};

export const mindustryClubSite: SiteConfiguration = {
  profile: 'mindustry-club',
  name: 'Mindustry Club',
  domain: 'mindustry.club',
  branding: { shortName: 'Mindustry Club', description: 'A community built by Mindustry players.' },
  localization: { defaultLocale: 'en', supportedLocales: ['en', 'ru', 'ja'] },
  verification: { requireEmail: true, requirePhoneForWrites: false },
  features: {
    resources: true, gameVersions: true, servers: false, serversDirectory: true,
    serverApplications: false, lanlink: false, developerFeed: false, phoneVerification: false,
    resourcePreModeration: false,
  },
  modules: ['community', 'international'],
  navigation: ['home', 'posts', 'resources', 'servers', 'wiki'],
  portalSections: ['trending', 'resources', 'discussions', 'community'],
  searchProviders: ['users', 'posts', 'resources', 'servers', 'game_versions', 'wiki'],
};

const SITE_PROFILES: Readonly<Record<SiteProfile, SiteConfiguration>> = { mdtbbs: mdtbbsSite, 'mindustry-club': mindustryClubSite };

@Injectable()
export class SiteConfigService {
  private readonly configuration: SiteConfiguration;

  constructor(config: ConfigService) {
    const configured = String(config.get('site.profile') || 'mdtbbs').toLowerCase();
    if (!(configured in SITE_PROFILES)) {
      throw new Error(`Unsupported SITE_PROFILE "${configured}". Supported profiles: ${Object.keys(SITE_PROFILES).join(', ')}`);
    }
    this.configuration = SITE_PROFILES[configured as SiteProfile];
  }

  get current(): SiteConfiguration { return this.configuration; }
  isEnabled(feature: string): boolean { return this.configuration.features[feature] === true; }
}
