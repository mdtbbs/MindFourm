import { DownloadPolicyService } from './download-policy.service';
import { DownloadGrantService } from './download-grant.service';
import { DownloadEventsService } from './download-events.service';

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

describe('DownloadGrantService', () => {
  it('records a grant and returns true for new grants', () => {
    const service = new DownloadGrantService();
    const result = service.recordGrant({
      resourceId: 1, versionId: 10, fileId: 100,
      grantedAt: new Date(), userId: 42, clientType: 'web',
    });
    expect(result).toBe(true);
  });

  it('deduplicates grants within the window', () => {
    const service = new DownloadGrantService();
    service.recordGrant({
      resourceId: 1, versionId: 10, fileId: 100,
      grantedAt: new Date(), userId: 42, clientType: 'web',
    });
    const second = service.recordGrant({
      resourceId: 1, versionId: 10, fileId: 100,
      grantedAt: new Date(), userId: 42, clientType: 'web',
    });
    expect(second).toBe(false);
  });

  it('computes displayed count as legacy + v1 aggregate', () => {
    const service = new DownloadGrantService();
    expect(service.computeDisplayedCount(100, 5)).toBe(105);
    expect(service.computeDisplayedCount(0, 0)).toBe(0);
  });
});

describe('DownloadEventsService', () => {
  it('records and counts granted events', () => {
    const service = new DownloadEventsService();
    service.recordEvent({
      event_type: 'granted', resource_id: 1, version_id: 10, file_id: 100,
      user_id: 42, client_type: 'web', platform: null, backend: 'local', created_at: new Date(),
    });
    expect(service.getAggregateCount(100)).toBe(1);
    expect(service.getResourceAggregate(1)).toBe(1);
    expect(service.getAggregateCount(999)).toBe(0);
  });
});
