import { Injectable } from '@nestjs/common';
import { resolve } from 'node:path';
import { SettingsService } from '../settings/settings.service';
import { SiteConfigService } from '../../config/site-profile';
import { isCloudSaveStorageConfigured } from '../game-saves/cloud-save-storage-config';

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
  multiplayer: {
    social_presence_v1: boolean;
    rich_activity_v1: boolean;
    multiplayer_sessions_v1: boolean;
    multiplayer_invites_v1: boolean;
    multiplayer_relay_v1: boolean;
    third_party_multiplayer_v1: boolean;
  };
  messages: { available: boolean; third_party_access: boolean };
  game_content: { maps: { read: boolean; download: boolean; upload: boolean }; schematics: { read: boolean; download: boolean; upload: boolean } };
  cloud_saves_v1: boolean;
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
  resource_mod_workbench: boolean;
  resource_schematic_workbench: boolean;
  resource_map_workbench: boolean;
  resource_versions_v2: boolean;
  resource_relations_v1: boolean;
  mod_content_index: boolean;
  mod_dependency_resolver: boolean;
  mod_compatibility_reports: boolean;
  schematic_deep_analysis: boolean;
  schematic_light_editor: boolean;
  map_deep_analysis: boolean;
  map_wave_viewer: boolean;
  schematic_full_editor: boolean;
  map_editor: boolean;
  wave_editor: boolean;
};

@Injectable()
export class CapabilitiesService {
  constructor(private readonly settingsService: SettingsService, private readonly siteConfig: SiteConfigService) {}

  async getCapabilities(): Promise<ClientCapabilities> {
    const [resourceRead, forumWrite, imageUpload, resourceDownload, resourceUpload,
      notifications, messages, thirdPartyMessages, socialPresence, richActivity, sessions, invites, relay, thirdPartyMultiplayer,
      cloudSavesEnabled, cloudSavePath] = await Promise.all([
      this.settingsService.getBoolean('feature_resources_v1_read_enabled', true),
      this.settingsService.getBoolean('feature_public_api_forum_write_enabled', true),
      this.settingsService.getBoolean('feature_public_api_image_upload_enabled', true),
      this.settingsService.getBoolean('feature_resources_v1_download_enabled', true),
      this.settingsService.getBoolean('feature_resources_v1_upload_enabled', true),
      this.settingsService.getBoolean('feature_notifications_v1_enabled', true),
      this.settingsService.getBoolean('feature_messages_enabled', true),
      this.settingsService.getBoolean('feature_messages_third_party_access_enabled', false),
      this.settingsService.getBoolean('feature_social_presence_v1_enabled', false),
      this.settingsService.getBoolean('feature_rich_activity_v1_enabled', false),
      this.settingsService.getBoolean('feature_multiplayer_sessions_v1_enabled', false),
      this.settingsService.getBoolean('feature_multiplayer_invites_v1_enabled', false),
      this.settingsService.getBoolean('feature_multiplayer_relay_v1_enabled', false),
      this.settingsService.getBoolean('feature_third_party_multiplayer_v1_enabled', false),
      this.settingsService.getBoolean('cloud_saves_enabled', false),
      this.settingsService.get('cloud_saves_storage_path'),
    ]);
    const cloudSavesAvailable = cloudSavesEnabled && isCloudSaveStorageConfigured(
      cloudSavePath || process.env.CLOUD_SAVES_STORAGE_PATH || resolve(process.cwd(), 'storage', 'cloud-saves'),
    );
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
      multiplayer: {
        social_presence_v1: socialPresence,
        rich_activity_v1: socialPresence && richActivity,
        multiplayer_sessions_v1: sessions,
        multiplayer_invites_v1: sessions && invites,
        multiplayer_relay_v1: sessions && relay,
        third_party_multiplayer_v1: thirdPartyMultiplayer,
      },
      messages: { available: messages, third_party_access: messages && thirdPartyMessages },
      game_content: {
        maps: { read: resourceRead, download: resourceRead && resourceDownload, upload: resourceUpload },
        schematics: { read: resourceRead, download: resourceRead && resourceDownload, upload: resourceUpload },
      },
      cloud_saves_v1: cloudSavesAvailable,
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
      resource_mod_workbench: resourceRead,
      resource_schematic_workbench: resourceRead,
      resource_map_workbench: resourceRead,
      resource_versions_v2: resourceRead,
      resource_relations_v1: resourceRead,
      mod_content_index: resourceRead,
      mod_dependency_resolver: resourceRead,
      mod_compatibility_reports: resourceRead,
      schematic_deep_analysis: resourceRead,
      schematic_light_editor: false,
      map_deep_analysis: resourceRead,
      map_wave_viewer: resourceRead,
      schematic_full_editor: false,
      map_editor: false,
      wave_editor: false,
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
