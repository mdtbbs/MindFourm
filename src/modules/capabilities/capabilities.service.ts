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

export type EditorToolStatus = {
  schematic: { enabled: boolean; reason: string | null; full_logic: boolean };
  map: { enabled: boolean; reason: string | null };
  wave: { enabled: boolean; reason: string | null };
};

type RendererHealth = {
  status?: unknown;
  protocolVersion?: unknown;
  buildDigest?: unknown;
  runtime?: { artifactSha256?: unknown };
  supportedOperations?: unknown;
};

type EditorReadiness = {
  rendererOperations: ReadonlySet<string>;
  storageReady: boolean;
};

// Kept in sync with tools/mindustry-renderer/test-renderer.sh and the runtime
// artifact reported by the renderer's health endpoint.
const REQUIRED_MINDUSTRY_SERVER_SHA256 = '0bd327c6c3d551e7e8fdab7b695517f809baacca3b1f5cb1c1a8dd74836620e0';
const READINESS_CACHE_MS = 10_000;
const READINESS_FAILURE_CACHE_MS = 2_000;
const READINESS_TIMEOUT_MS = 1_000;

@Injectable()
export class CapabilitiesService {
  private editorReadinessCache: { expiresAt: number; value: EditorReadiness } | null = null;
  private editorReadinessPromise: Promise<EditorReadiness> | null = null;

  constructor(private readonly settingsService: SettingsService, private readonly siteConfig: SiteConfigService) {}

  async getCapabilities(): Promise<ClientCapabilities> {
    const [resourceRead, forumWrite, imageUpload, resourceDownload, resourceUpload,
      notifications, messages, thirdPartyMessages, socialPresence, richActivity, sessions, invites, relay, thirdPartyMultiplayer,
      cloudSavesEnabled, cloudSavePath, resourceCenterEnabled] = await Promise.all([
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
      this.settingsService.getBoolean('feature_resources_enabled', true),
    ]);
    const cloudSavesAvailable = cloudSavesEnabled && isCloudSaveStorageConfigured(
      cloudSavePath || process.env.CLOUD_SAVES_STORAGE_PATH || resolve(process.cwd(), 'storage', 'cloud-saves'),
    );
    const resourceCenterAvailable = Boolean(this.siteConfig.current.features.resources && resourceCenterEnabled && resourceRead);
    const editorReadiness = resourceCenterAvailable && resourceUpload
      ? await this.getEditorReadiness()
      : { rendererOperations: new Set<string>(), storageReady: false };
    const schematicLightEditor = resourceCenterAvailable && resourceUpload && editorReadiness.storageReady
      && this.hasRendererOperations(editorReadiness, ['schematic.read', 'schematic.write', 'schematic.config.read', 'schematic.config.write']);
    const schematicFullEditor = schematicLightEditor
      && this.hasRendererOperations(editorReadiness, ['schematic.logic.read', 'schematic.logic.text.write']);
    const mapEditor = resourceCenterAvailable && resourceUpload && editorReadiness.storageReady
      && this.hasRendererOperations(editorReadiness, ['map.read', 'map.write', 'map.rules.read', 'map.rules.write', 'map.objects.read', 'map.objects.write']);
    const waveEditor = mapEditor
      && this.hasRendererOperations(editorReadiness, ['map.waves.read', 'map.waves.write']);
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
      schematic_light_editor: schematicLightEditor,
      map_deep_analysis: resourceRead,
      map_wave_viewer: resourceRead,
      schematic_full_editor: schematicFullEditor,
      map_editor: mapEditor,
      wave_editor: waveEditor,
    };
  }

  /** First-party tool-center status with a short reason suitable for a disabled editor card. */
  async getEditorToolStatus(): Promise<EditorToolStatus> {
    const readiness = await this.getEditorReadiness();
    // Local-file analysis, editing, and export do not write to Resource Center or RES.
    // Keep their readiness independent from publishing and workbench permissions.
    const schematicOperations = ['content.catalog', 'schematic.create', 'schematic.read', 'schematic.write', 'schematic.config.read', 'schematic.config.write'];
    const mapOperations = ['content.catalog', 'map.create', 'map.read', 'map.write', 'map.rules.read', 'map.rules.write', 'map.objects.read', 'map.objects.write'];
    const schematicEnabled = this.hasRendererOperations(readiness, schematicOperations);
    const mapEnabled = this.hasRendererOperations(readiness, mapOperations);
    const waveEnabled = mapEnabled && this.hasRendererOperations(readiness, ['map.waves.read', 'map.waves.write']);
    const reason = !readiness.rendererOperations.size ? 'renderer_unavailable' : 'editor_operation_unavailable';
    return {
      schematic: { enabled: schematicEnabled, reason: schematicEnabled ? null : reason,
        full_logic: schematicEnabled && this.hasRendererOperations(readiness, ['schematic.logic.read', 'schematic.logic.text.write']) },
      map: { enabled: mapEnabled, reason: mapEnabled ? null : reason },
      wave: { enabled: waveEnabled, reason: waveEnabled ? null : reason },
    };
  }

  private hasRendererOperations(readiness: EditorReadiness, operations: string[]): boolean {
    return operations.every((operation) => readiness.rendererOperations.has(operation));
  }

  private async getEditorReadiness(): Promise<EditorReadiness> {
    const now = Date.now();
    if (this.editorReadinessCache && this.editorReadinessCache.expiresAt > now) {
      return this.editorReadinessCache.value;
    }
    if (this.editorReadinessPromise) return this.editorReadinessPromise;
    this.editorReadinessPromise = this.checkEditorReadiness();
    try {
      const value = await this.editorReadinessPromise;
      const ready = value.storageReady && value.rendererOperations.size > 0;
      this.editorReadinessCache = {
        value,
        expiresAt: Date.now() + (ready ? READINESS_CACHE_MS : READINESS_FAILURE_CACHE_MS),
      };
      return value;
    } finally {
      this.editorReadinessPromise = null;
    }
  }

  private async checkEditorReadiness(): Promise<EditorReadiness> {
    const rendererUrl = process.env.RESOURCE_RENDERER_URL?.trim();
    const storageBaseUrl = process.env.RES_BASE_URL?.trim();
    const storageConfigured = process.env.RES_ENABLED === 'true'
      && Boolean(process.env.RES_API_KEY?.trim())
      && this.isHttpOrigin(storageBaseUrl);

    const storageHealth = storageConfigured && storageBaseUrl
      ? this.fetchHealth(`${storageBaseUrl.replace(/\/+$/, '')}/health`)
      : Promise.resolve(null);
    const rendererHealth = this.isHttpOrigin(rendererUrl)
      ? this.fetchHealth(`${rendererUrl!.replace(/\/+$/, '')}/health`, process.env.RESOURCE_RENDERER_TOKEN)
      : Promise.resolve(null);
    const [storage, renderer] = await Promise.all([storageHealth, rendererHealth]);
    const storageReady = storage?.status === 'ok';
    const runtimeHash = String(renderer?.runtime?.artifactSha256 || '').toLowerCase();
    const buildDigest = String(renderer?.buildDigest || '').toLowerCase();
    const operationList = Array.isArray(renderer?.supportedOperations) ? renderer!.supportedOperations : [];
    const rendererOperations = renderer?.status === 'ok'
      && Number(renderer.protocolVersion) >= 2
      && /^[a-f0-9]{64}$/.test(buildDigest)
      && runtimeHash === REQUIRED_MINDUSTRY_SERVER_SHA256
      ? new Set(operationList.filter((value): value is string => typeof value === 'string'))
      : new Set<string>();
    return { rendererOperations, storageReady };
  }

  private isHttpOrigin(value: string | undefined): boolean {
    if (!value) return false;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  private async fetchHealth(url: string, token?: string): Promise<RendererHealth | null> {
    try {
      const response = await fetch(url, {
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        signal: AbortSignal.timeout(READINESS_TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      const body: unknown = await response.json();
      return body && typeof body === 'object' && !Array.isArray(body) ? body as RendererHealth : null;
    } catch {
      return null;
    }
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
