import { DownloadPolicyService } from './download-policy.service';

describe('DownloadPolicyService', () => {
  it('requires login for map downloads by default and allows the admin setting to disable it', async () => {
    const settings = { getBoolean: jest.fn().mockResolvedValue(true) };
    const service = new DownloadPolicyService({} as any, {} as any, {} as any, settings as any);

    await expect(service.assertDownloadAuthentication('map', null)).rejects.toMatchObject({ status: 401 });
    expect(settings.getBoolean).toHaveBeenCalledWith('resource_download_map_auth_required', true);
    settings.getBoolean.mockResolvedValue(false);
    await expect(service.assertDownloadAuthentication('map', null)).resolves.toBeUndefined();
  });

  it('uses per-kind authentication settings and does not require login for unrelated kinds', async () => {
    const settings = { getBoolean: jest.fn().mockResolvedValue(true) };
    const service = new DownloadPolicyService({} as any, {} as any, {} as any, settings as any);

    await expect(service.assertDownloadAuthentication('mod', { id: 15 })).resolves.toBeUndefined();
    expect(settings.getBoolean).toHaveBeenCalledWith('resource_download_mod_auth_required', true);
    await expect(service.assertDownloadAuthentication('other', null)).resolves.toBeUndefined();
  });

  it('returns FILE_NOT_FOUND for missing file', async () => {
    const fileRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new DownloadPolicyService({} as any, {} as any, fileRepo as any);

    const result = await service.checkEligibility(999);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('FILE_NOT_FOUND');
  });

  it('returns RESOURCE_DELETED for soft-deleted resource', async () => {
    const file = { id: 1, resource_version_id: 10, availability_status: 'available' };
    const version = { id: 10, resource_id: 1, status: 'published' };
    const resource = { id: 1, is_public: 1, status: 'approved', deleted_at: new Date() };

    const service = new DownloadPolicyService(
      { findOne: jest.fn().mockResolvedValue(resource) } as any,
      { findOne: jest.fn().mockResolvedValue(version) } as any,
      { findOne: jest.fn().mockResolvedValue(file) } as any,
    );

    const result = await service.checkEligibility(1);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('RESOURCE_DELETED');
  });

  it('returns eligible for valid download', async () => {
    const file = { id: 1, resource_version_id: 10, availability_status: 'available' };
    const version = { id: 10, resource_id: 1, status: 'published' };
    const resource = { id: 1, is_public: 1, status: 'approved', deleted_at: null };

    const service = new DownloadPolicyService(
      { findOne: jest.fn().mockResolvedValue(resource) } as any,
      { findOne: jest.fn().mockResolvedValue(version) } as any,
      { findOne: jest.fn().mockResolvedValue(file) } as any,
    );

    const result = await service.checkEligibility(1);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeNull();
  });
});
