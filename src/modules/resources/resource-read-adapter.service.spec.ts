import { ResourceReadAdapterService } from './resource-read-adapter.service';
import { ResourceLegacyProjectionService } from './resource-legacy-projection.service';

describe('ResourceLegacyProjectionService', () => {
  const service = new ResourceLegacyProjectionService();

  it('uses description when available', () => {
    const result = service.projectToLegacy({
      id: 1, title: 'Test', description: 'Original desc', summary: 'New summary',
      version: '1.0', resource_type: 'upload', download_count: 10,
    });
    expect(result.description).toBe('Original desc');
  });

  it('falls back to summary when description is empty', () => {
    const result = service.projectToLegacy({
      id: 1, title: 'Test', description: '', summary: 'New summary',
      version: '1.0', resource_type: 'upload', download_count: 10,
    });
    expect(result.description).toBe('New summary');
  });

  it('shows 版本未知 for blank version', () => {
    const result = service.projectToLegacy({
      id: 1, title: 'Test', description: 'Desc', version: '',
      resource_type: 'upload', download_count: 0,
    });
    expect(result.version).toBe('版本未知');
  });

  it('shows 版本未知 for legacy-{id} pattern', () => {
    const result = service.projectToLegacy({
      id: 5, title: 'Test', description: 'Desc', version: 'legacy-5',
      resource_type: 'upload', download_count: 0,
    });
    expect(result.version).toBe('版本未知');
  });

  it('uses the real version when present', () => {
    const result = service.projectToLegacy({
      id: 1, title: 'Test', description: 'Desc', version: '2.1.0',
      resource_type: 'upload', download_count: 0,
    });
    expect(result.version).toBe('2.1.0');
  });
});

describe('ResourceReadAdapterService', () => {
  it('resolves the public canonical ID for a merged alias', async () => {
    const resourceRepo = {
      findOne: jest.fn()
        .mockResolvedValueOnce({ id: 1, merged_into_resource_id: 2 })
        .mockResolvedValueOnce({ id: 2, public_id: 'canonical-id', is_public: 1, status: 'published', merged_into_resource_id: null }),
    };
    const service = new ResourceReadAdapterService(
      resourceRepo as any, {} as any, {} as any, {} as any,
      new ResourceLegacyProjectionService(),
    );

    await expect(service.getMergedCanonicalPublicId('merged-id')).resolves.toBe('canonical-id');
  });

  it('returns null for non-existent resources', async () => {
    const resourceRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new ResourceReadAdapterService(
      resourceRepo as any, {} as any, {} as any, {} as any,
      new ResourceLegacyProjectionService(),
    );

    const result = await service.getResourceV1(999);
    expect(result).toBeNull();
  });

  it('returns null for non-public resources', async () => {
    const resourceRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 1, is_public: 0 }),
    };
    const service = new ResourceReadAdapterService(
      resourceRepo as any, {} as any, {} as any, {} as any,
      new ResourceLegacyProjectionService(),
    );

    const result = await service.getResourceV1(1);
    expect(result).toBeNull();
  });

  it('does not expose pending root Resources through public V1 reads', async () => {
    const service = new ResourceReadAdapterService(
      { findOne: jest.fn().mockResolvedValue({ id: 5, is_public: 1, status: 'pending', deleted_at: null }) } as any,
      {} as any, {} as any, {} as any, new ResourceLegacyProjectionService(),
    );
    await expect(service.getResourceV1(5)).resolves.toBeNull();
  });

  it('suppresses an initial quarantined preview in the public V1 preview entity', async () => {
    const resource = {
      id: 8, public_id: 'pending-map', is_public: 1, status: 'approved', deleted_at: null,
      file_path: '/uploads/.quarantine/resources/pending.msav', renderer_status: 'ready',
      renderer_preview_key: 'resources/map/aa/' + 'a'.repeat(64) + '/preview.png',
    };
    const versionRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new ResourceReadAdapterService(
      { findOne: jest.fn().mockResolvedValue(resource) } as any,
      versionRepo as any, {} as any, {} as any, new ResourceLegacyProjectionService(),
    );
    const result = await service.getPublicResourceEntityByPublicId('pending-map');
    expect(result?.renderer_status).toBe('unavailable');
    expect(result?.renderer_preview_key).toBeNull();
    expect(versionRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { resource_id: 8, status: 'published' } }));
  });

  it('allows authorized Resource members to download their pending version while anonymous callers cannot', async () => {
    const resource = { id: 9, user_id: 20, public_id: 'resource-pending', is_public: 1, status: 'approved', deleted_at: null };
    const pendingVersion = { id: 90, resource_id: 9, public_id: 'version-pending', status: 'pending_review' };
    const pendingFile = { id: 900, resource_version_id: 90, public_id: 'file-pending', availability_status: 'available' };
    const resourceRepo = { findOne: jest.fn().mockResolvedValue(resource) };
    const versionRepo = { findOne: jest.fn(async ({ where }: any) => where.status === 'published' ? null : pendingVersion) };
    const fileRepo = { findOne: jest.fn().mockResolvedValue(pendingFile) };
    const memberRepo = { findOne: jest.fn(async ({ where }: any) => where.user_id === 22 ? { role: 'publisher', status: 'active' } : null) };
    const service = new ResourceReadAdapterService(
      resourceRepo as any, versionRepo as any, {} as any, fileRepo as any,
      new ResourceLegacyProjectionService(), undefined, undefined, memberRepo as any,
    );

    await expect(service.getPublicFileByPublicIds('resource-pending', 'version-pending', 'file-pending'))
      .resolves.toBeNull();
    await expect(service.getPublicFileByPublicIds('resource-pending', 'version-pending', 'file-pending', { id: 21, role: 'user' }))
      .resolves.toBeNull();
    await expect(service.getPublicFileByPublicIds('resource-pending', 'version-pending', 'file-pending', { id: 22, role: 'user' }))
      .resolves.toMatchObject({ version: pendingVersion, file: pendingFile });
    expect(memberRepo.findOne).toHaveBeenCalledWith({ where: { resource_id: 9, user_id: 22, status: 'active' } });
  });

  it('builds a V1 DTO with attributions and versions', async () => {
    const resourceRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 1, title: 'Test Resource', is_public: 1, deleted_at: null,
        status: 'approved',
        public_id: 'abc-123', summary: 'A summary', description: 'Full desc',
        resource_kind: 'map', visibility: null,
        latest_published_version_id: 10, download_count: 42,
        metadata_json: { tags: ['survival'], planets: ['serpulo'] },
        renderer_status: 'ready',
        renderer_metadata_json: {
          width: 256, height: 128, spawns: 4, build: 160,
          tile_layers: { terrain: [{ x: 1, y: 2, name: 'sand' }], liquid: [] },
          tile_layers_truncated: true,
        },
      }),
    };
    const versionRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 10, resource_id: 1, version: '1.0', public_id: 'ver-abc', status: 'published', is_legacy_root_release: true, created_at: new Date() },
      ]),
    };
    const attributionRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 1, resource_id: 1, role: 'submitter', subject_type: 'local_user', display_name: null, user_id: 42, sort_order: 0 },
      ]),
    };
    const fileRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1, resource_version_id: 10, public_id: 'file-abc', role: 'primary',
          delivery_mode: 'managed', display_name: 'mod.jar',
          integrity_status: 'verified', availability_status: 'available', sort_order: 0,
        },
      ]),
    };

    const service = new ResourceReadAdapterService(
      resourceRepo as any, versionRepo as any, attributionRepo as any, fileRepo as any,
      new ResourceLegacyProjectionService(),
    );

    const result = await service.getResourceV1(1);

    expect(result).not.toBeNull();
    expect(result!.public_id).toBe('abc-123');
    expect(result!.title).toBe('Test Resource');
    expect(result!.summary).toBe('A summary');
    expect(result!.download_count).toBe(42);
    expect(result!.metadata.tags).toEqual(['survival']);
    expect(result!.metadata.preview.status).toBe('ready');
    expect(result!.metadata.map?.width).toBe(256);
    expect(result!.metadata.map?.planets).toEqual(['serpulo']);
    expect(result!.metadata.map?.stored_game_build).toBeNull();
    expect(result!.metadata.map?.tile_layers).toEqual({ terrain: [{ x: 1, y: 2, name: 'sand' }], liquid: [] });
    expect(result!.metadata.map?.tile_layers_truncated).toBe(true);
    expect(result!.attributions).toHaveLength(1);
    expect(result!.attributions[0].role).toBe('submitter');
    expect(result!.latest_version).not.toBeNull();
    expect(result!.latest_version!.files).toHaveLength(1);
    expect(result!.latest_version!.files[0].installable).toBe(true);
  });

  it('does not expose a pending initial map binary through the public Resource metadata projection', async () => {
    const resourceRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 2, title: 'Pending map', is_public: 1, deleted_at: null, public_id: 'pending-map',
        status: 'approved',
        resource_kind: 'map', latest_published_version_id: null,
        file_path: '/uploads/.quarantine/resources/pending.msav',
        renderer_status: 'ready', renderer_metadata_json: { width: 256, height: 128, cores: [{ x: 20, y: 30 }] },
        metadata_json: { tags: ['survival'] },
      }),
    };
    const service = new ResourceReadAdapterService(
      resourceRepo as any,
      { find: jest.fn().mockResolvedValue([{ id: 20, resource_id: 2, status: 'pending_review', version: '1.0.0' }]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      new ResourceLegacyProjectionService(),
    );

    const result = await service.getResourceV1(2);

    expect(result?.latest_version).toBeNull();
    expect(result?.metadata.preview).toEqual({ url: null, status: 'unavailable' });
    expect(result?.metadata.map?.width).toBeNull();
    expect(result?.metadata.map?.cores).toEqual([]);
    expect(result?.metadata.tags).toEqual(['survival']);
  });

  it('builds a stable launcher manifest from published versions', async () => {
    const resourceRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 1, public_id: 'resource-abc', resource_kind: 'mod', is_public: 1, status: 'approved', deleted_at: null }),
      find: jest.fn().mockResolvedValue([]),
      increment: jest.fn(),
    };
    const versionRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 10, resource_id: 1, public_id: 'version-abc', version: '1.2.0', status: 'published', release_channel: 'stable', published_at: new Date('2026-09-20T00:00:00.000Z'), created_at: new Date() },
      ]),
    };
    const fileRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 12, resource_version_id: 10, public_id: 'file-abc', role: 'primary', delivery_mode: 'managed', platform_key: 'android', architecture_key: null, package_type: 'jar', display_name: 'Example.jar', original_filename: 'Example.jar', mime_type: 'application/java-archive', size_bytes: 12, hash_algorithm: 'sha256', content_hash: 'hash', integrity_status: 'verified', availability_status: 'available', sort_order: 0 },
      ]),
    };
    const dependencyRepo = { find: jest.fn().mockResolvedValue([]) };
    const compatibilityRepo = { find: jest.fn().mockResolvedValue([{ resource_version_id: 10, runtime: 'mindustry', game_series: 'v7', min_version_value: null, max_version_value: null, channel: 'stable', platform_key: 'android', created_at: new Date() }]) };
    const service = new ResourceReadAdapterService(
      resourceRepo as any, versionRepo as any, {} as any, fileRepo as any,
      new ResourceLegacyProjectionService(), dependencyRepo as any, compatibilityRepo as any,
    );

    const result = await service.getManifestByPublicId('resource-abc');

    expect(result?.resource_public_id).toBe('resource-abc');
    expect(result?.versions[0].compatibility[0].platform).toBe('android');
    expect(result?.versions[0].files[0].installable).toBe(true);
    expect(result?.versions[0].files[0].download_url).toContain('/api/v1/resources/resource-abc/versions/version-abc/files/file-abc/download');
  });

  it('filters nonapproved resources from the public V1 list before pagination', async () => {
    const queryBuilder: any = {
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const service = new ResourceReadAdapterService(
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as any,
      {} as any, {} as any, {} as any, new ResourceLegacyProjectionService(),
    );
    await service.listResourcesV1({ limit: 20, offset: 0 });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith("resource.status IN ('approved','published')");
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('resource.merged_into_resource_id IS NULL');
  });
});
