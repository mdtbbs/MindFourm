import { CapabilitiesService } from './capabilities.service';

describe('CapabilitiesService', () => {
  it('uses SettingsService for the coarse resource V1 read capability', async () => {
    const settings = {
      getBoolean: jest.fn(async (key: string, fallback: boolean) => {
        if (key === 'feature_resources_v1_read_enabled') return true;
        return fallback;
      }),
    } as any;

    const service = new CapabilitiesService(settings);

    await expect(service.getCapabilities()).resolves.toEqual({
      resource_read: true,
      resource_files: false,
      download_grants: false,
      device_auth: false,
      notifications_v1: false,
      forge_preview: false,
      minimum_supported_client_version: null,
      recommended_client_version: null,
    });
    expect(settings.getBoolean).toHaveBeenCalledWith('feature_resources_v1_read_enabled', false);
  });
});
