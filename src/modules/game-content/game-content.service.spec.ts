import { toPublicResource } from '../resources/resource-public.dto';
import { GameContentService } from './game-content.service';

describe('GameContentService', () => {
  const resource = {
    id: 15,
    public_id: '9df6c1da-c6b5-4e4c-8ea8-9d0f77cabba2',
    resource_kind: 'schematic',
    title: '铜墙',
    summary: '紧凑布局',
    description: 'description',
    status: 'approved',
    is_public: 1,
    download_count: 3,
    view_count: '19',
    is_featured: 1,
    created_at: new Date('2026-09-01T00:00:00.000Z'),
    updated_at: new Date('2026-09-02T00:00:00.000Z'),
    metadata_json: { tags: ['防御'] },
    renderer_metadata_json: { width: 8, height: 6, requirements: [{ item: 'copper', amount: 120 }], block_types: [{ name: 'copper-wall', count: 12 }] },
    user: { id: 4, username: 'maker', avatar_url: '/avatar.png', email: 'private@example.test', phone_verified: true },
  } as any;
  const aggregateQuery = (rows: any[]) => ({ select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), groupBy: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue(rows) });
  const dependencies = () => {
    const resourceRepo = { findOne: jest.fn(), createQueryBuilder: jest.fn(), increment: jest.fn().mockResolvedValue(undefined) };
    const likeRepo = { createQueryBuilder: jest.fn(() => aggregateQuery([{ id: '15', count: '7' }])) };
    const favoriteRepo = { createQueryBuilder: jest.fn(() => aggregateQuery([{ id: '15', count: '2' }])) };
    const resourcesDomain = { getList: jest.fn().mockResolvedValue({ data: [resource], next_cursor: 'cursor-2', has_more: true }), getById: jest.fn().mockResolvedValue(resource), isResourcePubliclyAccessible: jest.fn().mockResolvedValue(true), create: jest.fn() };
    const likeService = { add: jest.fn().mockResolvedValue({ is_liked: true }) };
    const favoriteService = { add: jest.fn().mockResolvedValue({ is_favorited: true }) };
    const previewService = { resolveContentMetadata: jest.fn().mockResolvedValue({ items: { copper: { name: '铜', icon: 'data:image/png;base64,AA==' } }, blocks: { 'copper-wall': { name: '铜墙', icon: null } }, liquids: {} }), ensureProduction: jest.fn(), readPreview: jest.fn().mockResolvedValue(Buffer.from('preview')) };
    const storage = { removeManaged: jest.fn().mockResolvedValue(true), readManagedFile: jest.fn().mockResolvedValue(Buffer.from('mschpayload')), statManagedFile: jest.fn().mockResolvedValue({ path: '/uploads/resources/map.msav', size: 12 }) };
    const versions = { findOne: jest.fn().mockResolvedValue(null) };
    const files = {};
    const policy = { assertDownloadAuthentication: jest.fn().mockResolvedValue(undefined), checkEligibility: jest.fn().mockResolvedValue({ eligible: true }) };
    const grant = { recordGrant: jest.fn().mockResolvedValue(true) };
    const events = {};
    const redis = { setIfNotExists: jest.fn().mockResolvedValue(false) };
    const config = { get: jest.fn().mockReturnValue('test-secret') };
    const uploadSessions = { create: jest.fn(), getOwned: jest.fn(), claim: jest.fn(), setCompleted: jest.fn(), setUploaded: jest.fn(), getPreview: jest.fn() };
    const service = new GameContentService(resourceRepo as any, likeRepo as any, favoriteRepo as any, versions as any, files as any, resourcesDomain as any, likeService as any, favoriteService as any, previewService as any, storage as any, policy as any, grant as any, events as any, redis as any, config as any, uploadSessions as any);
    return { service, resourceRepo, likeRepo, favoriteRepo, resourcesDomain, likeService, favoriteService, previewService, redis, uploadSessions, storage, versions, files, policy, grant };
  };

  it('uses the shared resource query and returns a safe public DTO with batch statistics', async () => {
    const { service, resourcesDomain, redis } = dependencies();
    const result = await service.list('blueprint', { q: '铜', tags: '防御', gameVersion: '8', limit: '20' });
    expect(resourcesDomain.getList).toHaveBeenCalledWith(expect.objectContaining({ resource_kind: 'schematic', search: '铜', tags: '防御', supported_version: '8', limit: 20 }), { scope: 'public', featuredOnly: undefined, trendingOnly: false });
    expect(result.pagination).toEqual({ nextCursor: 'cursor-2', hasMore: true });
    expect(result.data[0]).toMatchObject({ id: 'bp_9df6c1da-c6b5-4e4c-8ea8-9d0f77cabba2', author: { id: 4, username: 'maker', avatar: '/avatar.png' }, stats: { downloads: 3, likes: 7, favorites: 2, views: 19 }, featured: true });
    expect(result.data[0].author).not.toHaveProperty('email');
    expect(result.data[0]).not.toHaveProperty('metadata_json');
    expect(redis.setIfNotExists).not.toHaveBeenCalled();
  });

  it('retains tags and previews through the real public resource projection', async () => {
    const { service, resourcesDomain } = dependencies();
    resourcesDomain.getList.mockResolvedValue({ data: [toPublicResource(resource, true)] as any, next_cursor: 'cursor-2', has_more: true });
    const result = await service.list('blueprint', { limit: '20' });
    expect(result.data[0]).toMatchObject({ tags: ['防御'], preview: { width: 8, height: 6, thumbnail: expect.stringContaining('/preview') } });
    expect(result.data[0]).not.toHaveProperty('renderer_metadata_json');
  });

  it('applies the public featured filter and time-window trending order through ResourcesService', async () => {
    const { service, resourcesDomain } = dependencies();
    await service.list('map', { featuredOnly: true, sort: 'trending', limit: '12' });
    expect(resourcesDomain.getList).toHaveBeenCalledWith(expect.objectContaining({ resource_kind: 'map', limit: 12 }), { scope: 'public', featuredOnly: true, trendingOnly: true });
  });

  it('hides renderer metadata and previews for approved Resources whose initial binary is still quarantined', async () => {
    const { service, resourcesDomain, resourceRepo, previewService } = dependencies();
    const pendingMap = {
      ...resource,
      resource_kind: 'map',
      file_path: '/uploads/.quarantine/resources/pending.msav',
      renderer_metadata_json: { width: 64, height: 32, build: 160 },
    };
    resourcesDomain.getList.mockResolvedValue({ data: [pendingMap] as any, next_cursor: null, has_more: false });
    const listed = await service.list('map', { limit: '20' });
    expect(listed.data[0].preview).toEqual({ thumbnail: null, width: null, height: null });
    expect(listed.data[0].game.minBuild).toBeNull();

    resourceRepo.findOne.mockResolvedValueOnce(pendingMap).mockResolvedValueOnce({ id: resource.id, view_count: '19' });
    (service as any).likes = { count: jest.fn().mockResolvedValue(0), findOne: jest.fn().mockResolvedValue(null) };
    (service as any).favorites = { count: jest.fn().mockResolvedValue(0), findOne: jest.fn().mockResolvedValue(null) };
    const detail = await service.detail('map', `map_${resource.public_id}`, null) as any;
    expect(detail.preview).toEqual({ image: null, width: null, height: null });
    expect(detail.map).toEqual({ mode: null, players: null, planet: null, resources: null, cores: null, waves: null });
    expect(previewService.ensureProduction).not.toHaveBeenCalled();
  });

  it('keeps quarantined blueprint bytes and map previews/downloads out of Game Content', async () => {
    const { service, resourceRepo, resourcesDomain, storage, previewService, versions, policy } = dependencies();
    const pendingSchematic = { ...resource, file_path: '/uploads/.quarantine/resources/pending.msch' };
    resourceRepo.findOne.mockResolvedValue(pendingSchematic);

    await expect(service.blueprintCode(`bp_${resource.public_id}`, null)).rejects.toThrow('蓝图文件不存在');
    expect(storage.readManagedFile).not.toHaveBeenCalled();

    const pendingMap = { ...pendingSchematic, resource_kind: 'map', file_path: '/uploads/.quarantine/resources/pending.msav' };
    resourceRepo.findOne.mockResolvedValue(pendingMap);
    await expect(service.downloadInfo(`map_${resource.public_id}`)).rejects.toThrow('地图文件暂不可用');
    await expect(service.prepareMapDownload(`map_${resource.public_id}`, null, 'game-content')).rejects.toThrow('地图文件暂不可用');
    expect(policy.assertDownloadAuthentication).toHaveBeenCalledTimes(2);
    expect(storage.statManagedFile).not.toHaveBeenCalled();

    await expect(service.preview('map', `map_${resource.public_id}`)).resolves.toBeNull();
    expect(previewService.readPreview).not.toHaveBeenCalled();
    expect(versions.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'published' }) }));
  });

  it('preserves Game Content downloads for legacy approved files outside quarantine', async () => {
    const { service, resourceRepo, resourcesDomain, storage, grant, policy } = dependencies();
    const legacyMap = { ...resource, resource_kind: 'map', file_path: '/uploads/resources/legacy.msav' };
    resourceRepo.findOne.mockResolvedValue(legacyMap);

    const info = await service.downloadInfo(`map_${resource.public_id}`);
    expect(info).toMatchObject({ filename: null, size: null, sha256: null });
    const target = await service.prepareMapDownload(`map_${resource.public_id}`, null, 'game-content');
    expect(target.path).toBe('/uploads/resources/map.msav');
    expect(target.version).toBeNull();
    expect(storage.statManagedFile).toHaveBeenCalledWith(legacyMap.file_path);
    expect(grant.recordGrant).toHaveBeenCalled();
    expect(policy.assertDownloadAuthentication).toHaveBeenCalledTimes(2);
  });

  it('maps renderer materials and blocks through the shared localized metadata service and counts one successful detail view', async () => {
    const { service, resourceRepo, previewService, redis } = dependencies();
    resourceRepo.findOne.mockResolvedValueOnce(resource).mockResolvedValueOnce({ id: resource.id, view_count: '20' });
    redis.setIfNotExists.mockResolvedValueOnce(true);
    const repo = { count: jest.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(2), findOne: jest.fn().mockResolvedValue(null) };
    (service as any).likes = repo;
    (service as any).favorites = repo;
    const result = await service.detail('blueprint', `bp_${resource.public_id}`, null);
    expect(result.materials).toEqual([{ id: 'copper', name: '铜', amount: 120, icon: 'data:image/png;base64,AA==' }]);
    expect(result.blocks).toEqual([{ id: 'copper-wall', name: '铜墙', count: 12, icon: null }]);
    expect(previewService.resolveContentMetadata).toHaveBeenCalledWith(['copper'], ['copper-wall'], []);
    expect(resourceRepo.increment).toHaveBeenCalledWith({ id: resource.id }, 'view_count', 1);
    expect(result.stats.views).toBe(20);
  });

  it('returns cached production analysis through Game Content with localized items, liquids and warning blocks', async () => {
    const { service, resourceRepo, previewService } = dependencies();
    const productionResource = {
      ...resource,
      renderer_metadata_json: {
        ...resource.renderer_metadata_json,
        production: {
          mode: 'theoretical', complete: false, available: true,
          items: { inputs: [{ id: 'coal', name: 'coal', rate: 12 }], outputs: [], internal: [] },
          liquids: { inputs: [{ id: 'water', name: 'water', rate: 24 }], outputs: [], internal: [] },
          power: { generated: 0, consumed: 30, net: -30 },
          warnings: [{ type: 'terrain-dependent', blockId: 'mechanical-drill', count: 1 }],
        },
      },
    };
    resourceRepo.findOne.mockResolvedValueOnce(productionResource).mockResolvedValueOnce({ id: resource.id, view_count: '20' });
    (service as any).likes = { count: jest.fn().mockResolvedValue(0), findOne: jest.fn().mockResolvedValue(null) };
    (service as any).favorites = { count: jest.fn().mockResolvedValue(0), findOne: jest.fn().mockResolvedValue(null) };
    previewService.resolveContentMetadata.mockResolvedValueOnce({
      items: { copper: { name: '铜', icon: null }, coal: { name: '煤', icon: 'data:image/png;base64,AA==' } },
      blocks: { 'copper-wall': { name: '铜墙', icon: null }, 'mechanical-drill': { name: '机械钻头', icon: null } },
      liquids: { water: { name: '水', icon: null } },
    });

    const result = await service.detail('blueprint', `bp_${resource.public_id}`, null) as any;
    expect(result.production).toMatchObject({
      mode: 'theoretical', complete: false,
      items: { inputs: [{ id: 'coal', name: '煤', rate: 12, icon: 'data:image/png;base64,AA==' }] },
      liquids: { inputs: [{ id: 'water', name: '水', rate: 24 }] },
      warnings: [{ blockId: 'mechanical-drill', blockName: '机械钻头' }],
    });
    expect(previewService.resolveContentMetadata).toHaveBeenCalledWith(['copper', 'coal'], ['copper-wall', 'mechanical-drill'], ['water']);
  });

  it('does not expose or count hidden resources through optional owner authentication', async () => {
    const { service, resourceRepo, resourcesDomain, redis } = dependencies();
    resourceRepo.findOne.mockResolvedValue(resource);
    resourcesDomain.isResourcePubliclyAccessible.mockResolvedValue(false);
    await expect(service.detail('blueprint', `bp_${resource.public_id}`, { id: 4, role: 'user' } as any)).rejects.toThrow('资源不存在');
    expect(redis.setIfNotExists).not.toHaveBeenCalled();
  });

  it('delegates likes and favorites to the existing resource interaction services', async () => {
    const { service, resourceRepo, likeService, favoriteService } = dependencies();
    resourceRepo.findOne.mockResolvedValue(resource);
    await service.toggleLike('blueprint', `bp_${resource.public_id}`, 42, true);
    await service.toggleFavorite('blueprint', `bp_${resource.public_id}`, 42, true);
    expect(likeService.add).toHaveBeenCalledWith(15, 42);
    expect(favoriteService.add).toHaveBeenCalledWith(15, 42);
  });

  it('uses distinct HMAC identities for anonymous resource views without putting IPs in Redis keys', async () => {
    const { service, resourceRepo, redis } = dependencies();
    redis.setIfNotExists.mockResolvedValue(true);
    await (service as any).countDetailView(15, null, '203.0.113.10');
    await (service as any).countDetailView(15, null, '203.0.113.11');
    const keys = redis.setIfNotExists.mock.calls.map(([key]) => key);
    expect(keys[0]).not.toContain('203.0.113.10');
    expect(keys[0]).not.toBe(keys[1]);
    expect(resourceRepo.increment).toHaveBeenCalledTimes(2);
  });

  it('creates a Resource once for a persistent map session and returns that Resource on repeated completion', async () => {
    const { service, resourceRepo, resourcesDomain, uploadSessions } = dependencies();
    const uploadId = '51d4e1d8-d9cd-42f4-8326-55b2d35f1455';
    const session = { id: uploadId, user_id: 8, status: 'uploaded', expires_at: new Date(Date.now() + 60_000), filename: 'map.msav', mime_type: 'application/octet-stream', actual_size: 123, actual_sha256: 'b'.repeat(64), expected_sha256: 'b'.repeat(64), storage_key: '/uploads/map.msav', preview_key: 'resources/map/bb/' + 'b'.repeat(64) + '/preview.png', parser_version: 'renderer-1', renderer_metadata: { width: 20, height: 18 }, resource_id: null };
    const created = { id: 71, public_id: '672ca7f3-12bb-4d42-b624-5eeb59d4a4bd', status: 'pending' };
    uploadSessions.getOwned.mockResolvedValueOnce(session).mockResolvedValueOnce({ ...session, status: 'completed', resource_id: 71 });
    uploadSessions.claim.mockResolvedValue(true);
    resourceRepo.createQueryBuilder.mockReturnValue({ addSelect: jest.fn().mockReturnThis(), withDeleted: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null) });
    resourceRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(created);
    resourcesDomain.create.mockResolvedValue(created);

    const first = await service.completeUpload(8, 'map', uploadId, { title: '测试地图', tags: ['电力'] });
    const second = await service.completeUpload(8, 'map', uploadId, { title: '测试地图', tags: ['电力'] });
    expect(resourcesDomain.create).toHaveBeenCalledTimes(1);
    expect(resourcesDomain.create).toHaveBeenCalledWith(expect.objectContaining({ resource_kind: 'map' }), 8, expect.objectContaining({ content_hash: 'b'.repeat(64) }), expect.objectContaining({ uploadSessionId: uploadId, rendererDraft: expect.objectContaining({ previewKey: session.preview_key }) }));
    expect(uploadSessions.setCompleted).toHaveBeenCalledWith(uploadId, 71);
    expect(second).toMatchObject({ id: `map_${created.public_id}`, resourceId: 71 });
    expect(first).toEqual(second);
  });

  it('rejects a map upload when the client hash does not match the server-computed hash', async () => {
    const { service, storage, uploadSessions } = dependencies();
    await expect(service.beginMapUpload(8, { file_name: 'map.msav', file_path: '/uploads/map.msav', file_size: 10, mime_type: 'application/octet-stream', content_hash: 'a'.repeat(64) }, 'b'.repeat(64))).rejects.toMatchObject({ response: { code: 'HASH_MISMATCH' } });
    expect(storage.removeManaged).toHaveBeenCalledWith('/uploads/map.msav');
    expect(uploadSessions.create).not.toHaveBeenCalled();
  });
});
