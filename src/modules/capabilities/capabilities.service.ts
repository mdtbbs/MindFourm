import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { SiteConfigService } from '../../config/site-profile';

export type ClientCapabilities = {
  site: {
    profile: string;
    name: string;
    domain: string;
    default_locale: string;
    supported_locales: string[];
    features: Readonly<Record<string, boolean>>;
  };
  verification: { email_required: boolean; phone_required_for_writes: boolean };
  forum: { read: boolean; write: boolean; search: boolean; image_upload: boolean };
  resources: { read: boolean; download: boolean; upload: boolean };
  notifications: { read: boolean; sse: boolean };
  messages: { available: boolean; third_party_access: boolean };
  game_content: { maps: { read: boolean; download: boolean; upload: boolean }; schematics: { read: boolean; download: boolean; upload: boolean } };
  client: { minimum_supported_version: string | null; recommended_version: string | null };
  resource_read: boolean;
  resource_files: boolean;
  download_grants: boolean;
  device_auth: boolean;
  notifications_v1: boolean;
  notices_v1: boolean;
  forge_preview: boolean;
  blueprint_production_analysis: boolean;
  minimum_supported_client_version: string | null;
  recommended_client_version: string | null;
};

@Injectable()
export class CapabilitiesService {
  constructor(private readonly settingsService: SettingsService, private readonly siteConfig: SiteConfigService) {}

  async getCapabilities(): Promise<ClientCapabilities> {
    const [resourceRead, forumWrite, imageUpload, resourceDownload, resourceUpload,
      notifications, messages, thirdPartyMessages] = await Promise.all([
      this.settingsService.getBoolean('feature_resources_v1_read_enabled', true),
      this.settingsService.getBoolean('feature_public_api_forum_write_enabled', true),
      this.settingsService.getBoolean('feature_public_api_image_upload_enabled', true),
      this.settingsService.getBoolean('feature_resources_v1_download_enabled', true),
      this.settingsService.getBoolean('feature_resources_v1_upload_enabled', true),
      this.settingsService.getBoolean('feature_notifications_v1_enabled', true),
      this.settingsService.getBoolean('feature_messages_enabled', true),
      this.settingsService.getBoolean('feature_messages_third_party_access_enabled', false),
    ]);
    return {
      site: {
        profile: this.siteConfig.current.profile,
        name: this.siteConfig.current.name,
        domain: this.siteConfig.current.domain,
        default_locale: this.siteConfig.current.localization.defaultLocale,
        supported_locales: [...this.siteConfig.current.localization.supportedLocales],
        features: this.siteConfig.current.features,
      },
      verification: {
        email_required: this.siteConfig.current.verification.requireEmail,
        phone_required_for_writes: this.siteConfig.current.verification.requirePhoneForWrites,
      },
      forum: { read: true, write: forumWrite, search: true, image_upload: imageUpload },
      resources: { read: resourceRead, download: resourceRead && resourceDownload, upload: resourceUpload },
      notifications: { read: notifications, sse: false },
      messages: { available: messages, third_party_access: messages && thirdPartyMessages },
      game_content: {
        maps: { read: resourceRead, download: resourceRead && resourceDownload, upload: resourceUpload },
        schematics: { read: resourceRead, download: resourceRead && resourceDownload, upload: resourceUpload },
      },
      client: { minimum_supported_version: null, recommended_version: null },
      // Legacy aliases remain until official clients migrate to nested capabilities.
      resource_read: resourceRead,
      resource_files: resourceRead,
      download_grants: resourceRead && resourceDownload,
      device_auth: false,
      notifications_v1: notifications,
      notices_v1: true,
      forge_preview: Boolean(process.env.RESOURCE_RENDERER_URL),
      blueprint_production_analysis: Boolean(process.env.RESOURCE_RENDERER_URL),
      minimum_supported_client_version: null,
      recommended_client_version: null,
    };
  }

  async getAndroidClientConfig(platform?: string, _versionCode?: number) {
    const minimum = Number(await this.settingsService.get('android_minimum_version_code') || 100);
    const latest = Number(await this.settingsService.get('android_latest_version_code') || minimum);
    return {
      platform: platform === 'android' ? 'android' : 'unknown',
      minimum_version_code: minimum, latest_version_code: latest,
      force_update: await this.settingsService.getBoolean('android_force_update', false),
      maintenance: await this.settingsService.getBoolean('android_maintenance', false),
      features: {
        posting: await this.settingsService.getBoolean('feature_public_api_forum_write_enabled', true),
        image_upload: await this.settingsService.getBoolean('feature_public_api_image_upload_enabled', true),
        notifications_sse: false,
      },
    };
  }
}
