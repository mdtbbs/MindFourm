const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({
  HttpException: class HttpException extends Error {},
  HttpStatus: { BAD_REQUEST: 400 },
  Injectable: () => () => undefined,
  Global: () => () => undefined,
  Module: () => () => undefined,
  Optional: () => () => undefined,
  Inject: () => () => undefined,
  NotFoundException: class NotFoundException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
  BadRequestException: class BadRequestException extends Error {},
  UnprocessableEntityException: class UnprocessableEntityException extends Error {},
  ConflictException: class ConflictException extends Error {
    response: any;
    constructor(response: any) { super(response?.message || String(response)); this.response = response; }
    getResponse() { return this.response; }
  },
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
  In: jest.fn((value) => ({ _type: 'in', _value: value })),
  IsNull: jest.fn(() => ({ _type: 'isNull' })),
  Not: jest.fn((value) => ({ _type: 'not', _value: value })),
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
  ManyToOne: decorator,
  OneToMany: decorator,
  ManyToMany: decorator,
  OneToOne: decorator,
  JoinColumn: decorator,
  JoinTable: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
  Unique: decorator,
}));

jest.mock('@entities/resource.entity', () => ({ Resource: class Resource {} }));
jest.mock('@entities/resource-category.entity', () => ({ ResourceCategory: class ResourceCategory {} }));
jest.mock('@entities/resource-version.entity', () => ({ ResourceVersion: class ResourceVersion {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));
jest.mock('@entities/resource-attribution.entity', () => ({ ResourceAttribution: class ResourceAttribution {} }));
jest.mock('@entities/resource-file.entity', () => ({ ResourceFile: class ResourceFile {} }));
jest.mock('@entities/resource-version-compatibility.entity', () => ({ ResourceVersionCompatibility: class ResourceVersionCompatibility {} }));
jest.mock('@entities/resource-rating.entity', () => ({ ResourceRating: class ResourceRating {} }));

jest.mock('../admin-notifications/admin-notifications.service', () => ({
  AdminNotificationsService: class AdminNotificationsService {},
}));
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class NotificationsService {},
}));
jest.mock('./mfl-client.service', () => ({
  MflClientService: class MflClientService {},
}));
jest.mock('./resource-categories.service', () => ({
  ResourceCategoryService: class ResourceCategoryService {},
}));
jest.mock('./resource-storage.service', () => ({
  ResourceStorageService: class ResourceStorageService {},
}));
jest.mock('@modules/content-safety/content-safety.service', () => ({
  ContentSafetyService: class ContentSafetyService {},
}));
jest.mock('./resource-subscriptions.service', () => ({
  ResourceSubscriptionsService: class ResourceSubscriptionsService {},
}));

import { ResourcesService } from './resources.service';
import { ResourceVersionCompatibility } from '@entities/resource-version-compatibility.entity';

function createService(overrides: {
  resourceRepository?: Record<string, jest.Mock>;
  resourceFileRepository?: Record<string, jest.Mock>;
  manager?: Record<string, jest.Mock>;
  dataSource?: Record<string, jest.Mock>;
  versionRepository?: Record<string, jest.Mock>;
  adminNotificationsService?: Record<string, jest.Mock>;
  mflClientService?: Record<string, jest.Mock>;
  resourceStorageService?: Record<string, jest.Mock>;
  resourcePreviewService?: Record<string, jest.Mock>;
  resourceDuplicateService?: Record<string, jest.Mock>;
} = {}) {
  const defaultQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    maxExecutionTime: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
  };

  const resourceRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((value: unknown) => value),
    save: jest.fn().mockImplementation(async (...args: unknown[]) => {
      const value = args.length > 1 ? args[1] : args[0];
      const applyId = (item: any) => ({ id: 81, ...item });
      return Array.isArray(value) ? value.map(applyId) : applyId(value);
    }),
    delete: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => defaultQb),
    ...overrides.resourceRepository,
  };
  const manager = {
    create: jest.fn().mockImplementation((_entity: unknown, value: unknown) => value),
    save: jest.fn().mockImplementation(async (value: unknown) => ({
      id: 81,
      ...(value as Record<string, unknown>),
    })),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([]),
    ...overrides.manager,
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn().mockImplementation(async (callback: (txnManager: typeof manager) => unknown) =>
      callback(manager)),
    ...overrides.dataSource,
  };
  const versionRepository = {
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides.versionRepository,
  };
  const resourceFileRepository = {
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides.resourceFileRepository,
  };
  const adminNotificationsService = {
    publishModerationPending: jest.fn().mockResolvedValue([]),
    publishModerationResult: jest.fn().mockResolvedValue([]),
    ...overrides.adminNotificationsService,
  };
  const mflClientService = {
    uploadFile: jest.fn(),
    getDownloadUrl: jest.fn(),
    syncApprovalStatus: jest.fn(),
    deleteFile: jest.fn(),
    ...overrides.mflClientService,
  };

  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
  };

  const service = new ResourcesService(
    resourceRepository as any,
    {} as any,
    {} as any,
    versionRepository as any,
    resourceFileRepository as any,
    {} as any,
    dataSource as any,
    adminNotificationsService as any,
    notificationsService as any,
    mflClientService as any,
    undefined,
    overrides.resourceStorageService as any,
    undefined,
    undefined,
    overrides.resourcePreviewService as any,
    overrides.resourceDuplicateService as any,
  );

  return {
    service,
    resourceRepository,
    manager,
    dataSource,
    versionRepository,
    resourceFileRepository,
    adminNotificationsService,
    mflClientService,
    defaultQb,
  };
}

describe('ResourcesService', () => {
  it('retains storage keys for authorized file operations without exposing them in public details', async () => {
    const resource = { id: 27, user_id: 9, status: 'published', is_public: 1, category_id: null,
      renderer_preview_key: 'map/preview.png', file_path: '/private/map.msav', mfl_download_url: 'https://files.example.test/map' };
    const { service, resourceRepository } = createService({ resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) } });
    await expect(service.getForFileAccess(27)).resolves.toMatchObject({ renderer_preview_key: 'map/preview.png', file_path: '/private/map.msav' });
    const detail = await service.getById(27);
    expect(detail).not.toHaveProperty('renderer_preview_key');
    expect(detail).not.toHaveProperty('file_path');
    expect(resourceRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ select: expect.arrayContaining(['file_path', 'renderer_preview_key', 'content_hash']) }));
  });

  it('denies anonymous file access to pending resources while allowing their owner', async () => {
    const resource = { id: 27, user_id: 9, status: 'pending', is_public: 1, category_id: null, file_path: '/private/map.msav' };
    const { service } = createService({ resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) } });
    await expect(service.getForFileAccess(27)).rejects.toThrow('资源不存在');
    await expect(service.getForFileAccess(27, { id: 9, role: 'user' })).resolves.toBe(resource);
  });

  it('keeps an unknown schematic minimum build unknown instead of persisting Build 0', async () => {
    const { service, manager } = createService({
      manager: {
        save: jest.fn(async (_entity: unknown, value: unknown) => ({ id: 81, ...(value as Record<string, unknown>) })),
      },
    });
    const resource = { id: 81, resource_type: 'upload', renderer_metadata_json: {
      compatibility: { minimum_supported_build: null, source: 'unknown', confidence: 'low' },
    } };

    await (service as any).createInitialV2Aggregate(manager, resource, { version: '1.0.0' }, 9, undefined, undefined);

    expect(manager.save.mock.calls.some(([entity]) => entity === ResourceVersionCompatibility)).toBe(false);
  });

  it('stores inferred and publisher-declared compatibility as separate evidence', async () => {
    const { service, manager } = createService({
      manager: {
        save: jest.fn(async (_entity: unknown, value: unknown) => ({ id: 81, ...(value as Record<string, unknown>) })),
      },
    });
    const resource = { id: 81, resource_type: 'upload', renderer_metadata_json: {
      compatibility: { minimum_supported_build: 135, source: 'inferred', confidence: 'medium' },
    } };

    await (service as any).createInitialV2Aggregate(manager, resource, {
      version: '1.0.0', compatibility: [{ min_version_value: '146', max_version_value: '160' }],
    }, 9, undefined, undefined);

    const compatibilities = manager.save.mock.calls.find(([entity]) => entity === ResourceVersionCompatibility)?.[1];
    expect(compatibilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ min_version_value: '146', max_version_value: '160', provenance: 'user_declared' }),
      expect.objectContaining({ min_version_value: '135', provenance: 'inferred', confidence: 'medium' }),
    ]));
  });

  it('sets featured only through the existing resource moderation service', async () => {
    const { service, resourceRepository } = createService();
    const resource = { id: 77, is_featured: 1, status: 'approved', is_public: 1, user: null, category: null };
    resourceRepository.findOne.mockResolvedValueOnce(resource).mockResolvedValueOnce(resource);
    await service.setFeatured(77, true);
    expect(resourceRepository.update).toHaveBeenCalledWith(77, { is_featured: 1 });
  });

  it('filters featured public resources without bypassing existing visibility conditions', async () => {
    const { service, defaultQb } = createService();
    await service.getList({ limit: 20 } as any, { scope: 'public', featuredOnly: true });
    expect(defaultQb.where).toHaveBeenCalledWith('resource.status IN (:...statuses)', expect.any(Object));
    expect(defaultQb.andWhere).toHaveBeenCalledWith('resource.is_public = :isPublic', { isPublic: 1 });
    expect(defaultQb.andWhere).toHaveBeenCalledWith('(category.id IS NULL OR category.is_active = :categoryActive)', { categoryActive: 1 });
    expect(defaultQb.andWhere).toHaveBeenCalledWith('resource.is_featured = 1');
  });

  it('orders trending public resources from the last seven days of persisted grants, likes, and favorites', async () => {
    const { service, defaultQb } = createService();
    await service.getList({ limit: 20 } as any, { scope: 'public', trendingOnly: true });
    expect(defaultQb.leftJoin).toHaveBeenCalledWith(expect.stringContaining("DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY resource_id"), 'download_trend', 'download_trend.resource_id = resource.id');
    expect(defaultQb.addSelect).toHaveBeenCalledWith(expect.stringContaining('COALESCE(download_trend.score'), 'trending_score');
    expect(defaultQb.orderBy).toHaveBeenCalledWith('trending_score', 'DESC');
  });

  it('returns visible comment_count independently of rating aggregates', async () => {
    const resource = { id: 17, user_id: 2, status: 'approved', is_public: 1, rating_count: 6, rating_sum: 24, rating_average: 4 };
    const { service, resourceRepository, dataSource } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      dataSource: { query: jest.fn().mockResolvedValue([{ resource_id: 17, comment_count: '2' }]) },
    });

    const result = await service.getById(17, { id: 9, role: 'user' });

    expect(result).toMatchObject({ rating_count: 6, comment_count: 2 });
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining("WHERE status = ? AND resource_id IN (?)"), ['visible', 17]);
    expect(resourceRepository.findOne).toHaveBeenCalled();
  });

  it('uses public resource statuses for the public list and filters disabled categories', async () => {
    const { service, resourceRepository, defaultQb } = createService();

    await service.getList({ status: 'pending', limit: 20 }, { scope: 'public' });

    // Public scope now uses createQueryBuilder (not find) to LEFT JOIN category
    expect(resourceRepository.createQueryBuilder).toHaveBeenCalledWith('resource');
    expect(defaultQb.leftJoin).toHaveBeenCalledWith('resource.category', 'category');
    expect(defaultQb.where).toHaveBeenCalledWith(
      'resource.status IN (:...statuses)',
      { statuses: ['approved', 'published'] },
    );
    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      'resource.is_public = :isPublic',
      { isPublic: 1 },
    );
    // The category-active filter ensures disabled categories are excluded
    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      '(category.id IS NULL OR category.is_active = :categoryActive)',
      { categoryActive: 1 },
    );
  });

  it('filters public resources by declared content language without restricting other languages', async () => {
    const { service, defaultQb } = createService();
    await service.getList({ content_language: 'ja', limit: 20 } as any, { scope: 'public' });
    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      'resource.content_language = :contentLanguage',
      { contentLanguage: 'ja' },
    );
  });

  it('allows anonymous reads of an approved public resource while preserving visibility checks', async () => {
    const resource = { id: 27, status: 'published', is_public: 1, category_id: null, user: null, category: null };
    const { service, resourceRepository } = createService({ resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) } });
    await expect(service.getById(27)).resolves.toMatchObject({ id: 27, status: 'published' });
    expect(resourceRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 27 } }));
  });

  it('filters public resources by safe metadata fields when requested', async () => {
    const { service, defaultQb } = createService();

    await service.getList({
      limit: 20,
      resource_kind: 'map',
      tag: 'campaign',
      supported_version: 'v8',
      compatibility: 'desktop',
    }, { scope: 'public' });

    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      'resource.resource_kind = :resourceKind',
      { resourceKind: 'map' },
    );
    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      "JSON_CONTAINS(resource.metadata_json, JSON_QUOTE(:resourceTag), '$.tags')",
      { resourceTag: 'campaign' },
    );
    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      "(EXISTS (SELECT 1 FROM resource_versions rv INNER JOIN resource_version_compatibilities rvc ON rvc.resource_version_id = rv.id WHERE rv.resource_id = resource.id AND rvc.runtime = 'mindustry' AND (rvc.min_version_value IS NULL OR rvc.min_version_value <= :supportedVersion) AND (rvc.max_version_value IS NULL OR rvc.max_version_value >= :supportedVersion)) OR JSON_CONTAINS(resource.metadata_json, JSON_QUOTE(:supportedVersion), '$.supported_versions'))",
      { supportedVersion: 'v8' },
    );
    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      "JSON_CONTAINS(resource.metadata_json, JSON_QUOTE(:resourceCompatibility), '$.compatibility')",
      { resourceCompatibility: 'desktop' },
    );
  });

  it('does not force a default status filter for the admin list', async () => {
    const { service, resourceRepository } = createService();

    await service.getList({ limit: 20 }, { scope: 'admin' });

    const where = resourceRepository.find.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('status');
    expect(where).not.toHaveProperty('is_public');
  });

  it('keeps the requested status filter for the admin list', async () => {
    const { service, resourceRepository } = createService();

    await service.getList({ status: 'pending', limit: 20 }, { scope: 'admin' });

    const where = resourceRepository.find.mock.calls[0][0].where;
    expect(where.status).toBe('pending');
  });

  it('publishes a moderation pending notification when a resource is created for review', async () => {
    const { service, adminNotificationsService, resourceRepository, manager } = createService({
      resourceRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 81,
          title: 'Useful Pack',
          description: 'A reviewed upload',
          resource_type: 'upload',
          status: 'pending',
          is_public: 1,
          file_size: 128,
          created_at: new Date('2026-07-08T10:00:00.000Z'),
          updated_at: new Date('2026-07-08T10:00:00.000Z'),
          user: { username: 'alice' },
          category: null,
        }),
      },
    });

    await service.create(
      {
        title: 'Useful Pack',
        description: 'A reviewed upload',
        resource_type: 'upload',
        version: '1.0.0',
      } as any,
      5,
      {
        file_name: 'pack.zip',
        file_path: './uploads/resources/pack.zip',
        file_size: 128,
        mime_type: 'application/zip',
        content_hash: 'a'.repeat(64),
      },
    );

    expect(manager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Useful Pack' }));
    expect(adminNotificationsService.publishModerationPending).toHaveBeenCalledWith({
      item_type: 'resource',
      item_id: 81,
      title: 'Useful Pack',
      content: 'A reviewed upload',
      author_username: 'alice',
      action_url: '/admin/resources/moderation',
    });
  });

  it('returns the stable exact-file duplicate conflict before opening a create transaction', async () => {
    const duplicate = { inspect: jest.fn().mockResolvedValue({
      exact: true, structure: false, normalized: false,
      existing_resources: [{ id: 19, public_id: 'existing', title: 'Existing pack', status: 'published', url: '/resources/19' }],
    }) };
    const { service, dataSource } = createService({ resourceDuplicateService: duplicate });

    await expect(service.create({ title: 'Pack', resource_type: 'upload', resource_kind: 'mod', version: '1.0' } as any, 7, {
      file_name: 'pack.zip', file_path: '/tmp/pack.zip', file_size: 10, mime_type: 'application/zip', content_hash: 'a'.repeat(64),
    })).rejects.toMatchObject({ response: { code: 'RESOURCE_DUPLICATE', existing_resource: { id: 19, title: 'Existing pack' } } });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('prevents importing the same source resource twice', async () => {
    const { service, dataSource, resourceRepository } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue({ id: 44 }) },
    });

    await expect(service.create({
      title: 'Imported Mod', resource_type: 'external', external_url: 'https://example.org/mod', version: '1.0.0',
    } as any, 7, undefined, {
      origin: { site: 'mdtbbs', resourceId: '123', url: 'https://mdtbbs.cn/resources/123' },
    })).rejects.toMatchObject({
      response: { code: 'RESOURCE_ORIGIN_ALREADY_IMPORTED', existing_resource_id: 44 },
    });
    expect(resourceRepository.findOne).toHaveBeenCalledWith({
      where: { origin_site: 'mdtbbs', origin_resource_id: '123' },
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('replays the same idempotency key for the same user and payload', async () => {
    const resource = { id: 81, user_id: 7, title: 'Replay', status: 'pending', is_public: 0, user: null, category: null };
    let service!: ResourcesService;
    const keyQuery = jest.fn(async (sql: string) => sql.includes('resource_submission_idempotency')
      ? [{ payload_fingerprint: (service as any).hashCanonical(payload), request_fingerprint: 'x', resource_id: 81 }]
      : [{ resource_id: 81, comment_count: '2' }]);
    const payload = { title: 'Replay', version: '1.0' };
    const created = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue([]) },
      dataSource: { query: keyQuery },
    });
    service = created.service;

    await expect(service.findIdempotentReplay(7, 'key-1', payload)).resolves.toMatchObject({ id: 81, title: 'Replay', comment_count: 2 });
    expect(keyQuery.mock.calls[0][1]).toEqual([7, 'key-1']);
    expect(created.resourceRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 81 } }));
  });

  it('rejects reuse of an idempotency key with a different payload and scopes the lookup by user', async () => {
    let service!: ResourcesService;
    const keyQuery = jest.fn(async (sql: string) => sql.includes('resource_submission_idempotency')
      ? [{ payload_fingerprint: (service as any).hashCanonical({ title: 'original' }), request_fingerprint: 'x', resource_id: 81 }]
      : []);
    const created = createService({ dataSource: { query: keyQuery } });
    service = created.service;

    await expect(service.findIdempotentReplay(7, 'shared-key', { title: 'changed' }))
      .rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(keyQuery.mock.calls[0][1]).toEqual([7, 'shared-key']);
  });

  it('releases a stale hash claim for a rejected resource but blocks an active pending claim without leaking its title', async () => {
    const { service } = createService();
    const manager = { query: jest.fn()
      .mockRejectedValueOnce({ errno: 1062, code: 'ER_DUP_ENTRY' })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ affectedRows: 1 }) };
    await (service as any).claimContentHash(manager, 'b'.repeat(64), 90);
    expect(manager.query).toHaveBeenLastCalledWith('UPDATE resource_content_hash_claims SET resource_id = ? WHERE content_hash = ?', [90, 'b'.repeat(64)]);

    const activeManager = { query: jest.fn()
      .mockRejectedValueOnce({ errno: 1062, code: 'ER_DUP_ENTRY' })
      .mockResolvedValueOnce([{ resource_id: 44, public_id: 'secret-id', title: 'Private title', status: 'pending', is_public: 0 }]) };
    await expect((service as any).claimContentHash(activeManager, 'c'.repeat(64), 91))
      .rejects.toMatchObject({ response: { code: 'RESOURCE_DUPLICATE', existing_resource: { id: null, title: '已有资源正在审核或不可见' } } });
  });

  it('publishes a moderation result notification when resource status changes', async () => {
    const { service, manager, adminNotificationsService } = createService({
      resourceRepository: {
        findOne: jest.fn()
          .mockResolvedValueOnce({
            id: 22,
            title: 'Useful Pack',
            status: 'pending',
            is_public: 1,
            file_size: 128,
            created_at: new Date('2026-07-08T10:00:00.000Z'),
            updated_at: new Date('2026-07-08T10:00:00.000Z'),
            user: { username: 'alice' },
            category: null,
          })
          .mockResolvedValueOnce({
            id: 22,
            title: 'Useful Pack',
            status: 'approved',
            is_public: 1,
            file_size: 128,
            created_at: new Date('2026-07-08T10:00:00.000Z'),
            updated_at: new Date('2026-07-08T10:05:00.000Z'),
            user: { username: 'alice' },
            category: null,
          }),
      },
    });

    await service.updateStatus(22, 'approved', { actorUsername: 'moderatorA' });

    expect(manager.update).toHaveBeenCalledWith(expect.anything(), 22, {
      status: 'approved',
      reject_reason: null,
    });
    expect(adminNotificationsService.publishModerationResult).toHaveBeenCalledWith({
      item_type: 'resource',
      item_id: 22,
      action: 'approved',
      actor_username: 'moderatorA',
      subject: 'Useful Pack',
      action_url: '/admin/resources?status=approved',
    });
  });

  it('rejects a map declared as an external resource before it can enter moderation', async () => {
    const { service } = createService();

    await expect(service.create({
      title: 'Invalid map', resource_type: 'external', resource_kind: 'map',
      external_url: 'https://example.com/map.msav', version: '1.0',
    } as any, 5)).rejects.toThrow('地图必须上传本站托管文件');
  });

  it('rejects a download URL even when a blueprint also includes a managed file', async () => {
    const { service } = createService();

    await expect(service.create({
      title: 'Blueprint', resource_type: 'upload', resource_kind: 'schematic',
      external_url: 'https://example.com/blueprint.msch', version: '1.0',
    } as any, 5, {
      file_name: 'blueprint.msch', file_path: '/safe/blueprint.msch', file_size: 12,
      mime_type: 'application/octet-stream', content_hash: 'a'.repeat(64),
    })).rejects.toThrow('不能设置外链地址');
  });

  it('does not let an existing blueprint gain an external download address', async () => {
    const { service, manager } = createService({
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 23, user_id: 5, title: 'Blueprint', status: 'pending', resource_type: 'upload',
          resource_kind: 'schematic', file_name: 'blueprint.msch', file_path: '/safe/blueprint.msch',
        }),
      },
    });

    await expect(service.update(23, 5, { external_url: 'https://example.com/blueprint.msch' } as any, 'user'))
      .rejects.toThrow('不能设置外链地址');
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('allows a resource author to update its declared content language', async () => {
    const existing = {
      id: 23, user_id: 5, title: 'Blueprint', status: 'approved', resource_type: 'upload',
      resource_kind: 'schematic', file_name: 'blueprint.msch', file_path: '/safe/blueprint.msch',
      category_id: null, is_public: 1, user: { username: 'alice' }, category: null,
    };
    const { service, manager } = createService({
      manager: { findOne: jest.fn().mockResolvedValue(existing) },
    });

    await service.update(23, 5, { content_language: 'ja' } as any, 'user');

    expect(manager.update).toHaveBeenCalledWith(expect.anything(), 23, { content_language: 'ja' });
  });

  it('enqueues an approved map for forum-owned rendering', async () => {
    const preview = { supports: jest.fn().mockReturnValue(true), enqueue: jest.fn().mockResolvedValue(undefined) };
    const { service } = createService({
      resourcePreviewService: preview,
      resourceRepository: {
        findOne: jest.fn()
          .mockResolvedValueOnce({
            id: 31, title: 'Map', status: 'pending', resource_kind: 'map', file_name: 'map.msav', file_path: '/safe/map.msav',
            content_hash: 'a'.repeat(64), is_public: 1, file_size: 12, created_at: new Date(), updated_at: new Date(), user: { username: 'alice' }, category: null,
          })
          .mockResolvedValueOnce({
            id: 31, title: 'Map', status: 'approved', resource_kind: 'map', file_name: 'map.msav', file_path: '/safe/map.msav',
            content_hash: 'a'.repeat(64), is_public: 1, file_size: 12, created_at: new Date(), updated_at: new Date(), user: { username: 'alice' }, category: null,
          }),
      },
    });

    await service.updateStatus(31, 'approved');

    expect(preview.supports).toHaveBeenCalledWith(expect.objectContaining({ id: 31, resource_kind: 'map' }));
    expect(preview.enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: 31, file_name: 'map.msav' }));
  });

  it('promotes release files and keeps the structured delivery pointer in sync', async () => {
    const storage = {
      promote: jest.fn()
        .mockResolvedValueOnce('/uploads/resources/pack.zip')
        .mockResolvedValueOnce('/uploads/resources/pack.zip'),
    };
    const { service, resourceRepository, versionRepository, resourceFileRepository } = createService({
      resourceStorageService: storage,
      resourceRepository: {
        findOne: jest.fn()
          .mockResolvedValueOnce({
            id: 32, title: 'Pack', status: 'pending', resource_type: 'upload',
            file_path: '/uploads/.quarantine/resources/pack.zip', user_id: 5,
            is_public: 1, created_at: new Date(), updated_at: new Date(), user: { username: 'alice' }, category: null,
          })
          .mockResolvedValueOnce({
            id: 32, title: 'Pack', status: 'approved', resource_type: 'upload',
            file_path: '/uploads/resources/pack.zip', user_id: 5,
            is_public: 1, created_at: new Date(), updated_at: new Date(), user: { username: 'alice' }, category: null,
          }),
      },
      versionRepository: {
        find: jest.fn().mockResolvedValue([{ id: 302, resource_id: 32, file_path: '/uploads/.quarantine/resources/pack.zip' }]),
      },
    });

    await service.updateStatus(32, 'approved');

    expect(versionRepository.update).toHaveBeenCalledWith(302, { file_path: '/uploads/resources/pack.zip' });
    expect(resourceFileRepository.update).toHaveBeenCalledWith(
      { resource_version_id: 302, role: 'primary' },
      { storage_key: '/uploads/resources/pack.zip' },
    );
    expect(resourceRepository.update).toHaveBeenCalledWith(32, { file_path: '/uploads/resources/pack.zip' });
  });

  it('returns an actionable error when an approved upload is no longer available', async () => {
    const missingFile = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    const { service, resourceRepository } = createService({
      resourceStorageService: { promote: jest.fn().mockRejectedValue(missingFile) },
      resourceRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 33, title: 'Missing pack', status: 'pending', resource_type: 'upload',
          file_path: '/uploads/.quarantine/resources/missing.zip', user_id: 5,
          is_public: 1, created_at: new Date(), updated_at: new Date(), user: { username: 'alice' }, category: null,
        }),
      },
    });

    await expect(service.updateStatus(33, 'approved')).rejects.toThrow('资源文件不存在或已失效，请重新上传后再审核');
    expect(resourceRepository.update).not.toHaveBeenCalled();
  });
  it('retains explicit version compatibility while dropping private storage fields', () => {
    const { service } = createService();
    const compatibility = [{ runtime: 'mindustry', min_version_value: '160', max_version_value: null }];
    const normalized = (service as any).normalizeVersion({ id: 1, status: 'published', version: 'v1', compatibility, file_path: '/private/file', reviewed_by_user_id: 42 });
    expect(normalized.compatibility).toEqual(compatibility);
    expect(normalized).not.toHaveProperty('file_path');
    expect(normalized).not.toHaveProperty('reviewed_by_user_id');
  });

});
