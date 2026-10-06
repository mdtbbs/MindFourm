import { CapabilitiesService } from './capabilities.service';
import { SiteConfigService } from '../../config/site-profile';

describe('CapabilitiesService', () => {
  const envKeys = ['RESOURCE_RENDERER_URL', 'RESOURCE_RENDERER_TOKEN', 'RES_ENABLED', 'RES_BASE_URL', 'RES_API_KEY'] as const;
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;

  afterEach(() => {
    for (const key of envKeys) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = originalFetch;
  });

  it('uses SettingsService for the coarse resource V1 read capability', async () => {
    const settings = {
      get: jest.fn(async () => null),
      getBoolean: jest.fn(async (key: string, fallback: boolean) => {
        if (key === 'feature_resources_v1_read_enabled') return true;
        return fallback;
      }),
    } as any;

    const service = new CapabilitiesService(settings, new SiteConfigService({ get: jest.fn().mockReturnValue(undefined) } as any));

    await expect(service.getCapabilities()).resolves.toMatchObject({
      site: { profile: 'mdtbbs', default_locale: 'zh-CN', supported_locales: ['zh-CN'] },
      verification: { email_required: false, phone_required_for_writes: true },
      forum: { read: true, write: true, search: true, image_upload: true },
      resources: { read: true, download: true, upload: true },
      notifications: { read: true, sse: false },
      messages: { available: true, third_party_access: false },
      game_content: { maps: { read: true, download: true, upload: true }, schematics: { read: true, download: true, upload: true } },
      client: { minimum_supported_version: null, recommended_version: null },
      resource_read: true,
      resource_files: true,
      download_grants: true,
      device_auth: false,
      notifications_v1: true,
      notices_v1: true,
      forge_preview: false,
      blueprint_production_analysis: false,
      minimum_supported_client_version: null,
      recommended_client_version: null,
      resource_mod_workbench: true,
      resource_schematic_workbench: true,
      resource_map_workbench: true,
      resource_versions_v2: true,
      resource_relations_v1: true,
      mod_content_index: true,
      mod_dependency_resolver: true,
      mod_compatibility_reports: true,
      schematic_deep_analysis: true,
      schematic_light_editor: false,
      map_deep_analysis: true,
      map_wave_viewer: true,
      schematic_full_editor: false,
      map_editor: false,
      wave_editor: false,
    });
    expect(settings.getBoolean).toHaveBeenCalledWith('feature_resources_v1_read_enabled', true);
  });

  it('advertises previews only when the forum-owned renderer is configured', async () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    const service = new CapabilitiesService({ getBoolean: jest.fn().mockResolvedValue(false), get: jest.fn() } as any, new SiteConfigService({ get: jest.fn().mockReturnValue(undefined) } as any));
    await expect(service.getCapabilities()).resolves.toEqual(expect.objectContaining({ forge_preview: true, blueprint_production_analysis: true }));
  });

  it('enables editor capabilities only when the pinned renderer operations and RES health are ready', async () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    process.env.RESOURCE_RENDERER_TOKEN = 'renderer-secret';
    process.env.RES_ENABLED = 'true';
    process.env.RES_BASE_URL = 'http://127.0.0.1:4100';
    process.env.RES_API_KEY = 'res-secret';
    const operations = [
      'schematic.read', 'schematic.write', 'schematic.logic.read', 'schematic.logic.text.write',
      'map.read', 'map.write', 'map.rules.read', 'map.rules.write', 'map.waves.read', 'map.waves.write',
    ];
    global.fetch = jest.fn(async (input) => {
      const url = String(input);
      const body = url.includes(':6100') ? {
        status: 'ok', protocolVersion: 2, buildDigest: 'a'.repeat(64),
        runtime: { artifactSha256: 'fc686a6198419a91cbc1649f93f10cc54f8e1e65160313840c9aab7c2c78fe57' },
        supportedOperations: operations,
      } : { status: 'ok' };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const settings = { get: jest.fn(async () => null), getBoolean: jest.fn(async (_key: string, fallback: boolean) => fallback) } as any;
    const service = new CapabilitiesService(settings, new SiteConfigService({ get: jest.fn().mockReturnValue(undefined) } as any));

    const [first, second] = await Promise.all([service.getCapabilities(), service.getCapabilities()]);
    expect(first).toMatchObject({ schematic_light_editor: true, schematic_full_editor: true, map_editor: true, wave_editor: true });
    expect(second).toMatchObject({ schematic_light_editor: true, schematic_full_editor: true, map_editor: true, wave_editor: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:6100/health', expect.objectContaining({
      headers: { authorization: 'Bearer renderer-secret' },
    }));
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:4100/health', expect.any(Object));
  });

  it('keeps editor capabilities disabled for wrong runtime hashes, missing operations, or unavailable RES', async () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    process.env.RES_ENABLED = 'true';
    process.env.RES_BASE_URL = 'http://127.0.0.1:4100';
    process.env.RES_API_KEY = 'res-secret';
    global.fetch = jest.fn(async (input) => new Response(JSON.stringify(String(input).includes(':6100') ? {
      status: 'ok', protocolVersion: 2, buildDigest: 'a'.repeat(64),
      runtime: { artifactSha256: '0'.repeat(64) },
      supportedOperations: ['schematic.read', 'schematic.write', 'schematic.logic.read', 'schematic.logic.text.write'],
    } : { status: 'unavailable' }), { status: 200 })) as typeof fetch;
    const settings = { get: jest.fn(async () => null), getBoolean: jest.fn(async (_key: string, fallback: boolean) => fallback) } as any;
    const service = new CapabilitiesService(settings, new SiteConfigService({ get: jest.fn().mockReturnValue(undefined) } as any));

    await expect(service.getCapabilities()).resolves.toMatchObject({
      schematic_light_editor: false, schematic_full_editor: false, map_editor: false, wave_editor: false,
    });
  });

  it('does not advertise editors when the site profile or resource feature switch is disabled', async () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    process.env.RES_ENABLED = 'true';
    process.env.RES_BASE_URL = 'http://127.0.0.1:4100';
    process.env.RES_API_KEY = 'res-secret';
    global.fetch = jest.fn(originalFetch);
    const settings = {
      get: jest.fn(async () => null),
      getBoolean: jest.fn(async (key: string, fallback: boolean) => key === 'feature_resources_enabled' ? false : fallback),
    } as any;
    const site = new SiteConfigService({ get: jest.fn().mockReturnValue(undefined) } as any);
    const service = new CapabilitiesService(settings, site);

    await expect(service.getCapabilities()).resolves.toMatchObject({
      schematic_light_editor: false, schematic_full_editor: false, map_editor: false, wave_editor: false,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
