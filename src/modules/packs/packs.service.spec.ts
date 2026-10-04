import { BadRequestException, ConflictException } from '@nestjs/common';
import { PacksService } from './packs.service';

describe('PacksService pinned membership', () => {
  const hash = 'a'.repeat(64);
  const pack = {
    id: 1, public_id: 'pack-public', resource_kind: 'pack', user_id: 7,
    status: 'approved', is_public: 1, visibility: 'public', category_id: null,
    merged_into_resource_id: null, latest_published_version_id: 999,
  };
  const packVersion = { id: 11, public_id: 'pack-version-public', resource_id: 1, version: '1.2.0', status: 'published' };
  const target = {
    id: 2, public_id: 'map-public', resource_kind: 'map', title: 'Public Map', user_id: 8,
    status: 'approved', is_public: 1, visibility: 'public', category_id: null,
    merged_into_resource_id: null,
  };
  const targetVersion = { id: 22, public_id: 'map-version-v3', resource_id: 2, version: '3.0.0', status: 'published' };
  const primaryFile = {
    id: 33, public_id: 'map-file-public', resource_version_id: 22, role: 'primary',
    availability_status: 'available', hash_algorithm: 'sha256', content_hash: hash,
    original_filename: 'map.msav', display_name: null, size_bytes: 1024, delivery_mode: 'managed',
  };

  function createService(options: {
    targetVersionStatus?: string;
    packVersionStatus?: string;
    downloadResult?: boolean;
    dependencies?: any[];
    dependencyResources?: any[];
  } = {}) {
    const itemRepo = {
      find: jest.fn(async () => [{ id: 44, pack_version_id: 11, member_resource_version_id: 22, sort_order: 0 }]),
    };
    const resourceRepo: any = {
      findOne: jest.fn(async ({ where }: any) => where.public_id === 'pack-public' || where.id === 1 ? pack : where.id === 2 ? target : null),
      find: jest.fn(async () => [target, ...(options.dependencyResources || [])]),
    };
    const categoryRepo = { findOne: jest.fn(), find: jest.fn(async () => []) };
    const versionRepo = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where.public_id === 'pack-version-public' && where.resource_id === 1) return { ...packVersion, status: options.packVersionStatus || packVersion.status };
        if (where.public_id === 'map-version-v3') return options.targetVersionStatus === 'pending' && where.status === 'published'
          ? null : { ...targetVersion, status: options.targetVersionStatus || targetVersion.status };
        if (where.id === 22) return targetVersion;
        return null;
      }),
      find: jest.fn(async ({ where }: any) => options.targetVersionStatus === 'pending' && where.status === 'published'
        ? [] : [{ ...targetVersion, status: options.targetVersionStatus || targetVersion.status }]),
    };
    const fileRepo = { find: jest.fn(async () => [primaryFile]) };
    const dependencyRepo = { find: jest.fn(async () => options.dependencies || []) };
    const compatibilityRepo = { find: jest.fn(async () => []) };
    const manager = { delete: jest.fn(), insert: jest.fn() };
    const dataSource = { transaction: jest.fn(async (callback: any) => callback(manager)) };
    const capabilities = { getCapabilities: jest.fn(async () => ({ resources: { read: true, download: true, upload: true } })) };
    const downloadGrants = { recordGrant: jest.fn(async () => options.downloadResult ?? true) };
    const service = new PacksService(
      itemRepo as any, resourceRepo, categoryRepo as any, versionRepo as any,
      fileRepo as any, dependencyRepo as any, compatibilityRepo as any,
      dataSource as any, capabilities as any, downloadGrants as any,
    );
    return { service, itemRepo, resourceRepo, categoryRepo, versionRepo, fileRepo, dependencyRepo, compatibilityRepo, dataSource, manager, capabilities, downloadGrants };
  }

  it('requires an exact published version when replacing Pack membership', async () => {
    const { service, dataSource } = createService({ targetVersionStatus: 'pending', packVersionStatus: 'draft' });

    await expect(service.replaceItems('pack-public', 'pack-version-public', 7, [
      { resource_version_public_id: 'map-version-v3' },
    ])).rejects.toBeInstanceOf(BadRequestException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('keeps published Pack version membership immutable', async () => {
    const { service, dataSource } = createService();

    await expect(service.replaceItems('pack-public', 'pack-version-public', 7, [])).rejects.toBeInstanceOf(ConflictException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('builds a deterministic manifest from the pinned version and never follows latest_published_version_id', async () => {
    const { service, versionRepo } = createService();

    const manifest = await service.getManifest('pack-public', 'pack-version-public');

    expect(manifest).toEqual({
      schema_version: 1,
      pack: { public_id: 'pack-public', version_public_id: 'pack-version-public', version: '1.2.0', game_version: null },
      members: [{
        resource_kind: 'map', resource_public_id: 'map-public', name: 'Public Map',
        version_public_id: 'map-version-v3', version: '3.0.0',
        file_name: 'map.msav', size_bytes: 1024, sha256: hash,
        dependencies: [],
        download_url: '/api/v1/resources/map-public/versions/map-version-v3/files/map-file-public/download',
      }],
    });
    expect(versionRepo.find).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(manifest)).not.toContain('latest_published_version_id');
    expect(JSON.stringify(manifest)).not.toMatch(/"(?:id|resource_id|version_id|file_id)"\s*:/);
  });

  it('does not expose public IDs for private dependency resources', async () => {
    const { service } = createService({
      dependencies: [{
        id: 80, resource_version_id: 22, dependency_type: 'required', target_resource_id: 3,
        external_identifier: null, version_constraint: '^1.0', notes: null, sort_order: 0,
      }],
      dependencyResources: [{ id: 3, public_id: 'private-dependency-public-id', status: 'approved', is_public: 0, visibility: 'private' }],
    });

    const manifest = await service.getManifest('pack-public', 'pack-version-public');

    expect(manifest.members[0].dependencies[0].resource_public_id).toBeNull();
    expect(JSON.stringify(manifest)).not.toContain('private-dependency-public-id');
  });

  it('resolves 100 pinned members with a bounded number of batch repository reads and stable order', async () => {
    const memberships = Array.from({ length: 100 }, (_, index) => ({
      id: 1000 + index, pack_version_id: 11, member_resource_version_id: 200 + index, sort_order: index,
    }));
    const memberVersions = memberships.map((membership, index) => ({
      id: membership.member_resource_version_id, public_id: `version-${index}`, resource_id: 300 + index,
      version: `1.${index}.0`, status: 'published',
    })).reverse();
    const memberResources = memberships.map((membership, index) => ({
      id: 300 + index, public_id: `resource-${index}`, resource_kind: 'map', title: `Map ${index}`,
      status: 'approved', is_public: 1, visibility: 'public', category_id: null, merged_into_resource_id: null,
    }));
    const memberFiles = memberships.map((membership, index) => ({
      ...primaryFile, id: 400 + index, public_id: `file-${index}`,
      resource_version_id: membership.member_resource_version_id,
      original_filename: `map-${index}.msav`,
    }));
    const itemRepo = { find: jest.fn(async () => memberships) };
    const resourceRepo: any = {
      findOne: jest.fn(async ({ where }: any) => where.public_id === 'pack-public' || where.id === 1 ? pack : null),
      find: jest.fn(async () => memberResources),
    };
    const categoryRepo = { findOne: jest.fn(), find: jest.fn(async () => []) };
    const versionRepo = {
      findOne: jest.fn(async ({ where }: any) => where.public_id === 'pack-version-public' ? packVersion : null),
      find: jest.fn(async () => memberVersions),
    };
    const fileRepo = { find: jest.fn(async () => memberFiles) };
    const dependencyRepo = { find: jest.fn(async () => []) };
    const compatibilityRepo = { find: jest.fn(async () => []) };
    const capabilities = { getCapabilities: jest.fn(async () => ({ resources: { read: true, download: true, upload: true } })) };
    const service = new PacksService(
      itemRepo as any, resourceRepo, categoryRepo as any, versionRepo as any, fileRepo as any,
      dependencyRepo as any, compatibilityRepo as any, {} as any, capabilities as any, {} as any,
    );

    const manifest = await service.getManifest('pack-public', 'pack-version-public');

    const repositoryCalls = [itemRepo, resourceRepo, categoryRepo, versionRepo, fileRepo, dependencyRepo, compatibilityRepo]
      .flatMap((repo: any) => ['find', 'findOne'].map((method) => repo[method]?.mock.calls.length || 0))
      .reduce((sum, count) => sum + count, 0);
    expect(repositoryCalls).toBeLessThanOrEqual(9);
    expect(manifest.members).toHaveLength(100);
    expect(manifest.members[0].name).toBe('Map 0');
    expect(manifest.members[99].name).toBe('Map 99');
    expect(JSON.stringify(manifest)).not.toMatch(/"(?:id|resource_id|version_id|file_id)"\s*:/);
  });

  it('issues batch grants only for the Pack-pinned file versions through DownloadGrantService', async () => {
    const { service, downloadGrants } = createService();
    const request = { user: { id: 42 }, headers: { 'user-agent': 'Launcher/1.0' } };

    const response = await service.createDownloadGrants('pack-public', 'pack-version-public', request);

    expect(downloadGrants.recordGrant).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: 2, versionId: 22, fileId: 33, userId: 42, clientType: 'public-v1-pack',
    }), 'user:42');
    const grantRecord = downloadGrants.recordGrant.mock.calls[0][0];
    expect(grantRecord).not.toHaveProperty('ip');
    expect(grantRecord).not.toHaveProperty('userAgent');
    expect(response).toEqual({
      pack_public_id: 'pack-public',
      pack_version_public_id: 'pack-version-public',
      grants: [{
        resource_public_id: 'map-public', resource_version_public_id: 'map-version-v3',
        file_public_id: 'map-file-public',
        download_url: '/api/v1/resources/map-public/versions/map-version-v3/files/map-file-public/download',
        granted: true,
      }],
    });
  });
});
