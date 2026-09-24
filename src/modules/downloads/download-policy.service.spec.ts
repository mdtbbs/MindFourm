import { DownloadPolicyService } from './download-policy.service';

describe('DownloadPolicyService', () => {
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
