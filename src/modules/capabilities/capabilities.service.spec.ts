import { CapabilitiesService } from './capabilities.service';

describe('CapabilitiesService', () => {
  const previousRendererUrl = process.env.RESOURCE_RENDERER_URL;

  afterEach(() => {
    if (previousRendererUrl === undefined) delete process.env.RESOURCE_RENDERER_URL;
    else process.env.RESOURCE_RENDERER_URL = previousRendererUrl;
  });

  it('uses SettingsService for the coarse resource V1 read capability', async () => {
    const settings = {
      getBoolean: jest.fn(async (key: string, fallback: boolean) => {
        if (key === 'feature_resources_v1_read_enabled') return true;
        return fallback;
      }),
    } as any;

    const service = new CapabilitiesService(settings);

    await expect(service.getCapabilities()).resolves.toMatchObject({
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
    });
    expect(settings.getBoolean).toHaveBeenCalledWith('feature_resources_v1_read_enabled', true);
  });

  it('advertises previews only when the forum-owned renderer is configured', async () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    const service = new CapabilitiesService({ getBoolean: jest.fn().mockResolvedValue(false), get: jest.fn() } as any);
    await expect(service.getCapabilities()).resolves.toEqual(expect.objectContaining({ forge_preview: true, blueprint_production_analysis: true }));
  });
});
