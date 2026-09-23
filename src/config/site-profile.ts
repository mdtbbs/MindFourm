import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SiteProfile = 'mdtbbs';

export interface SiteConfiguration {
  profile: SiteProfile;
  name: string;
  domain: string;
  branding: { shortName: string; description: string };
  features: Readonly<Record<string, boolean>>;
  modules: readonly string[];
  navigation: readonly string[];
  portalSections: readonly string[];
  searchProviders: readonly string[];
}

export const mdtbbsSite: SiteConfiguration = {
  profile: 'mdtbbs',
  name: 'Mindustry 中文社区',
  domain: 'mdt.bbs',
  branding: { shortName: 'MDTBBS', description: 'Mindustry 中文社区' },
  features: { resources: true, gameVersions: true, servers: true, lanlink: true, developerFeed: true },
  modules: ['community', 'mdtbbs'],
  navigation: ['home', 'posts', 'resources', 'servers', 'wiki'],
  portalSections: ['discussions', 'resources', 'news', 'notices', 'development', 'versions'],
  searchProviders: ['users', 'posts', 'resources', 'servers', 'game_versions', 'wiki', 'developer_feed'],
};

const SITE_PROFILES: Readonly<Record<SiteProfile, SiteConfiguration>> = { mdtbbs: mdtbbsSite };

@Injectable()
export class SiteConfigService {
  private readonly configuration: SiteConfiguration;

  constructor(config: ConfigService) {
    const configured = String(config.get('site.profile') || 'mdtbbs').toLowerCase();
    if (!(configured in SITE_PROFILES)) {
      throw new Error(`Unsupported SITE_PROFILE "${configured}". Supported profiles: mdtbbs`);
    }
    this.configuration = SITE_PROFILES[configured as SiteProfile];
  }

  get current(): SiteConfiguration { return this.configuration; }
  isEnabled(feature: string): boolean { return this.configuration.features[feature] === true; }
}
