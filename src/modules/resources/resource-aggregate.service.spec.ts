import { ResourceAggregateService } from './resource-aggregate.service';

describe('ResourceAggregateService', () => {
  describe('validateFileIntegrity', () => {
    const service = new ResourceAggregateService(
      {} as any,
      {} as any,
    );

    it('accepts managed + verified', () => {
      expect(service.validateFileIntegrity('managed', 'verified')).toBe(true);
    });

    it('accepts managed + unverified_legacy', () => {
      expect(service.validateFileIntegrity('managed', 'unverified_legacy')).toBe(true);
    });

    it('accepts mfl + unverified_legacy', () => {
      expect(service.validateFileIntegrity('mfl', 'unverified_legacy')).toBe(true);
    });

    it('accepts external + unverified_legacy', () => {
      expect(service.validateFileIntegrity('external', 'unverified_legacy')).toBe(true);
    });

    it('rejects external + verified (external files cannot be verified)', () => {
      expect(service.validateFileIntegrity('external', 'verified')).toBe(false);
    });

    it('rejects unknown delivery mode', () => {
      expect(service.validateFileIntegrity('torrent', 'verified')).toBe(false);
    });
  });

  describe('resolveLatestPublishedVersion', () => {
    it('selects the newest published version', async () => {
      const mockVersion = { id: 5, status: 'published', published_at: new Date('2026-08-01') };
      const versionRepo = {
        find: jest.fn().mockResolvedValue([mockVersion]),
      };
      const service = new ResourceAggregateService({} as any, versionRepo as any);

      const result = await service.resolveLatestPublishedVersion(1);

      expect(result).toBe(mockVersion);
      expect(versionRepo.find).toHaveBeenCalledWith({
        where: { resource_id: 1, status: 'published' },
        order: { published_at: 'DESC', id: 'DESC' },
        take: 1,
      });
    });

    it('returns null when no published version exists', async () => {
      const versionRepo = { find: jest.fn().mockResolvedValue([]) };
      const service = new ResourceAggregateService({} as any, versionRepo as any);

      const result = await service.resolveLatestPublishedVersion(1);

      expect(result).toBeNull();
    });
  });

  describe('refreshLatestPublishedVersion', () => {
    it('updates the resource with the new latest version id', async () => {
      const mockVersion = { id: 5, status: 'published' };
      const versionRepo = { find: jest.fn().mockResolvedValue([mockVersion]) };
      const resourceRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
      const service = new ResourceAggregateService(resourceRepo as any, versionRepo as any);

      const result = await service.refreshLatestPublishedVersion(1);

      expect(result).toBe(mockVersion);
      expect(resourceRepo.update).toHaveBeenCalledWith(1, { latest_published_version_id: 5 });
    });

    it('sets latest_published_version_id to null when no versions remain', async () => {
      const versionRepo = { find: jest.fn().mockResolvedValue([]) };
      const resourceRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
      const service = new ResourceAggregateService(resourceRepo as any, versionRepo as any);

      const result = await service.refreshLatestPublishedVersion(1);

      expect(result).toBeNull();
      expect(resourceRepo.update).toHaveBeenCalledWith(1, { latest_published_version_id: null });
    });
  });
});
