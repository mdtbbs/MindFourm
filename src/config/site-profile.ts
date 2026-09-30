import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SITE_PROFILES, SiteConfiguration, SiteProfile } from './site-profile-data';

export * from './site-profile-data';

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
