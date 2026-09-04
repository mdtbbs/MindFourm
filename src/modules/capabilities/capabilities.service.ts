import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export type ClientCapabilities = {
  resource_read: boolean;
  resource_files: boolean;
  download_grants: boolean;
  device_auth: boolean;
  notifications_v1: boolean;
  notices_v1: boolean;
  forge_preview: boolean;
  minimum_supported_client_version: string | null;
  recommended_client_version: string | null;
};

@Injectable()
export class CapabilitiesService {
  constructor(private readonly settingsService: SettingsService) {}

  async getCapabilities(): Promise<ClientCapabilities> {
    return {
      resource_read: await this.settingsService.getBoolean('feature_resources_v1_read_enabled', false),
      resource_files: false,
      download_grants: false,
      device_auth: false,
      notifications_v1: false,
      notices_v1: true,
      forge_preview: Boolean(process.env.MDT_FORGE_URL && process.env.MDT_FORGE_API_KEY),
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
      features: { posting: false, image_upload: false, notifications_sse: false },
    };
  }
}
