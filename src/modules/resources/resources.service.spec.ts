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
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceReviewEvent } from '@entities/resource-center-v2.entity';

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
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides.versionRepository,
  };
  const resourceFileRepository = {
    update: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => defaultQb),
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
  it('honors explicit private visibility before issuing a file URL', async () => {
    const { service } = createService();
    await expect(service.isResourcePubliclyAccessible({ status: 'approved', is_public: 1, visibility: 'private' })).resolves.toBe(false);
  });

  it('keeps metadata-first draft Resources out of public detail and search results', async () => {
    const { service, resourceRepository } = createService();
    await expect(service.isResourcePubliclyAccessible({ status: 'draft', is_public: 1, visibility: 'public' })).resolves.toBe(false);
    await service.getPublicResources();
    expect(resourceRepository.createQueryBuilder().where).toHaveBeenCalledWith(
      'resource.status IN (:...statuses)', expect.objectContaining({ statuses: expect.not.arrayContaining(['draft']) }),
    );
  });

  it('retains storage keys for authorized file operations without exposing them in public details', async () => {
    const resource = { id: 27, user_id: 9, status: 'published', is_public: 1, category_id: null,
      renderer_preview_key: 'map/preview.png', file_path: '/private/map.msav', mfl_download_url: 'https://files.example.test/map' };
    const { service, resourceRepository } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { findOne: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.getForFileAccess(27)).resolves.toMatchObject({ renderer_preview_key: 'map/preview.png', file_path: '/private/map.msav' });
    const detail = await service.getById(27);
    expect(detail).not.toHaveProperty('renderer_preview_key');
    expect(detail).not.toHaveProperty('file_path');
    expect(resourceRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ select: expect.arrayContaining(['file_path', 'renderer_preview_key', 'content_hash']) }));
  });

  it('uses only the latest published version for the legacy default download target', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null,
      latest_published_version_id: 10, file_path: '/uploads/.quarantine/resources/pending.jar' };
    const published = { id: 10, resource_id: 27, status: 'published', file_path: '/uploads/resources/old.jar',
      file_name: 'old.jar', file_size: 12, mime_type: 'application/java-archive', content_hash: 'a'.repeat(64) };
    const { service, versionRepository } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { findOne: jest.fn().mockResolvedValue(published) },
    });
    await expect(service.getForFileAccess(27)).resolves.toMatchObject({
      file_path: '/uploads/resources/old.jar', file_name: 'old.jar', content_hash: 'a'.repeat(64),
    });
    expect(versionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 10, resource_id: 27, status: 'published' },
    });
  });

  it('hides a quarantined initial binary after Resource approval until its version is reviewed', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null,
      latest_published_version_id: null, file_path: '/uploads/.quarantine/resources/initial.jar',
      renderer_status: 'ready', renderer_preview_key: 'resources/map/aa/' + 'a'.repeat(64) + '/preview.png' };
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { findOne: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.getForFileAccess(27)).resolves.toMatchObject({
      file_path: null, renderer_status: 'unavailable', renderer_preview_key: null,
    });
  });

  it('denies anonymous file access to pending resources while allowing their owner', async () => {
    const resource = { id: 27, user_id: 9, status: 'pending', is_public: 1, category_id: null, file_path: '/private/map.msav' };
    const { service } = createService({ resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) } });
    await expect(service.getForFileAccess(27)).rejects.toThrow('资源不存在');
    await expect(service.getForFileAccess(27, { id: 9, role: 'user' })).resolves.toBe(resource);
  });

  it('keeps pending versions out of legacy public Resource details while showing them to the owner', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [
      { id: 22, resource_id: 27, public_id: 'pending-version', version: '2.0.0', status: 'pending_review' },
      { id: 21, resource_id: 27, public_id: 'published-version', version: '1.0.0', status: 'published' },
    ];
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
    });

    const publicRead = await service.getByIdWithVersions(27);
    expect(publicRead.versions.map((version: any) => version.public_id)).toEqual(['published-version']);
    const ownerRead = await service.getByIdWithVersions(27, { id: 9, role: 'user' });
    expect(ownerRead.versions.map((version: any) => version.public_id)).toEqual(['pending-version', 'published-version']);
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

  it('keeps an initial binary pending even when Resource metadata is already approved', async () => {
    const { service, manager } = createService();
    const resource = { id: 81, resource_type: 'upload', resource_kind: 'other', status: 'approved' };

    await (service as any).createInitialV2Aggregate(manager, resource, { version: '1.0.0' }, 9, {
      file_path: '/uploads/.quarantine/resources/initial.zip', file_name: 'initial.zip', file_size: 4,
      mime_type: 'application/zip', content_hash: 'a'.repeat(64),
    }, undefined);

    expect(manager.save).toHaveBeenCalledWith(ResourceVersion, expect.objectContaining({
      status: 'pending_review', published_at: null, recommended: 0,
    }));
    expect(manager.save).toHaveBeenCalledWith(ResourceReviewEvent, expect.objectContaining({
      event_type: 'submitted', result: 'pending_review',
    }));
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
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining("reply.post_id = resource.discussion_thread_id AND reply.status = 'published'"), [17]);
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
      "(EXISTS (SELECT 1 FROM resource_versions rv INNER JOIN resource_version_compatibilities rvc ON rvc.resource_version_id = rv.id WHERE rv.resource_id = resource.id AND rv.status = 'published' AND rvc.runtime = 'mindustry' AND (rvc.min_version_value IS NULL OR rvc.min_version_value <= :supportedVersion) AND (rvc.max_version_value IS NULL OR rvc.max_version_value >= :supportedVersion)) OR JSON_CONTAINS(resource.metadata_json, JSON_QUOTE(:supportedVersion), '$.supported_versions'))",
      { supportedVersion: 'v8' },
    );
    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      "JSON_CONTAINS(resource.metadata_json, JSON_QUOTE(:resourceCompatibility), '$.compatibility')",
      { resourceCompatibility: 'desktop' },
    );
  });

  it('does not apply public map metadata filters to a quarantined initial binary', async () => {
    const { service, defaultQb } = createService();
    await service.getList({ resource_kind: 'map', planet: 'erekir', block: 'core-shard', width: 64, height: 32 } as any, { scope: 'public' });
    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      '(resource.file_path IS NULL OR resource.file_path NOT LIKE :quarantineResourcePath)',
      { quarantineResourcePath: '%/.quarantine/%' },
    );
    expect(defaultQb.addSelect).toHaveBeenCalledWith('resource.file_path', 'resource_card_file_path');
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
    const preview = { supports: jest.fn().mockReturnValue(true), enqueue: jest.fn().mockResolvedValue(undefined), setResPreviewVisibility: jest.fn().mockResolvedValue(undefined) };
    const { service } = createService({
      resourcePreviewService: preview,
      versionRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 311, status: 'published', file_path: '/safe/published-map.msav',
          file_name: 'published-map.msav', file_size: 12, mime_type: 'application/octet-stream',
          content_hash: 'a'.repeat(64),
        }),
      },
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
    expect(preview.enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: 31, file_name: 'published-map.msav' }));
    expect(preview.enqueue).toHaveBeenCalledWith(expect.objectContaining({ file_path: '/safe/published-map.msav' }));
  });

  it('keeps Resource approval separate from V2 binary review and records the resource event', async () => {
    const { service, manager } = createService({
      resourceRepository: {
        findOne: jest.fn()
          .mockResolvedValueOnce({ id: 34, title: 'Map', status: 'pending', resource_kind: 'map', user_id: 5, file_path: '/safe/map.msav', is_public: 1, created_at: new Date(), updated_at: new Date(), user: { username: 'alice' }, category: null })
          .mockResolvedValueOnce({ id: 34, title: 'Map', status: 'approved', resource_kind: 'map', user_id: 5, file_path: '/safe/map.msav', is_public: 1, created_at: new Date(), updated_at: new Date(), user: { username: 'alice' }, category: null }),
      },
      manager: { query: jest.fn().mockResolvedValue([{ id: 304, release_channel: 'release' }]) },
    });

    await service.updateStatus(34, 'approved', { actorUserId: 91 });

    expect(manager.update).not.toHaveBeenCalledWith(expect.anything(), 304, expect.objectContaining({ status: 'published' }));
    expect(manager.update).not.toHaveBeenCalledWith(expect.anything(), 34, { latest_published_version_id: 304 });
    expect(manager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      resource_id: 34, resource_version_id: 304, actor_user_id: 91, event_type: 'resource_approved', result: 'approved',
    }));
  });

  it('does not promote pending release files when only the Resource is approved', async () => {
    const storage = {
      promote: jest.fn()
        .mockResolvedValue('/uploads/resources/pack.zip'),
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
      manager: { query: jest.fn().mockResolvedValue([{ id: 302, release_channel: 'release' }]) },
    });

    await service.updateStatus(32, 'approved');

    expect(storage.promote).not.toHaveBeenCalled();
    expect(versionRepository.update).not.toHaveBeenCalled();
    expect(resourceFileRepository.update).not.toHaveBeenCalled();
    expect(resourceRepository.update).not.toHaveBeenCalled();
  });

  it('allows Resource approval when a pending version file is still quarantined', async () => {
    const missingFile = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    const { service, resourceRepository } = createService({
      resourceStorageService: { promote: jest.fn().mockRejectedValue(missingFile) },
      resourceRepository: {
        findOne: jest.fn()
          .mockResolvedValueOnce({
            id: 33, title: 'Missing pack', status: 'pending', resource_type: 'upload',
            file_path: '/uploads/.quarantine/resources/missing.zip', user_id: 5,
            is_public: 1, created_at: new Date(), updated_at: new Date(), user: { username: 'alice' }, category: null,
          })
          .mockResolvedValueOnce({
            id: 33, title: 'Missing pack', status: 'approved', resource_type: 'upload',
            file_path: '/uploads/.quarantine/resources/missing.zip', user_id: 5,
            is_public: 1, created_at: new Date(), updated_at: new Date(), user: { username: 'alice' }, category: null,
          }),
      },
    });

    await expect(service.updateStatus(33, 'approved')).resolves.toBeDefined();
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

describe('RES Resource lifecycle visibility', () => {
  it('keeps a published private file available while its binding remains private', async () => {
    const service = Object.create(ResourcesService.prototype) as ResourcesService;
    const file = { id: 31, public_id: 'file-id', resource_version_id: 11, provider_object_id: 'res-id', provider_binding_id: 'binding-id' };
    const query = { innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([file]) };
    (service as any).resourceFileRepository = { createQueryBuilder: jest.fn().mockReturnValue(query), update: jest.fn().mockResolvedValue({}) };
    (service as any).versionRepository = { find: jest.fn().mockResolvedValue([{ id: 11, status: 'published' }]) };
    (service as any).resClient = { createBinding: jest.fn().mockResolvedValue({ id: 'binding-id' }) };
    await (service as any).setResFileVisibility(7, 'private');
    expect((service as any).resClient.createBinding).toHaveBeenCalledWith('res-id', expect.objectContaining({ visibility: 'private' }));
    expect((service as any).resourceFileRepository.update).toHaveBeenCalledWith(31, { availability_status: 'available' });
    (service as any).versionRepository.find.mockResolvedValue([{ id: 11, status: 'pending_review' }]);
    await (service as any).setResFileVisibility(7, 'public');
    expect((service as any).resClient.createBinding).toHaveBeenLastCalledWith('res-id', expect.objectContaining({ visibility: 'private' }));
    expect((service as any).resourceFileRepository.update).toHaveBeenLastCalledWith(31, { availability_status: 'pending' });
  });

  it('privates leftover merged source bindings and restores both resources on database rollback', async () => {
    const service = Object.create(ResourcesService.prototype) as ResourcesService;
    const source = { id: 7, status: 'approved', is_public: 1, visibility: 'public' };
    const target = { id: 8, status: 'approved', is_public: 1, visibility: 'public' };
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.startsWith('SELECT * FROM resources WHERE id IN')) return [source, target];
        if (sql.startsWith('INSERT INTO resource_merge_logs')) throw new Error('merge audit failed');
        return [];
      }),
      createQueryBuilder: jest.fn().mockReturnValue({ update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue({}) }),
    };
    (service as any).dataSource = { transaction: jest.fn(async (callback) => callback(manager)) };
    jest.spyOn(service as any, 'resourceMergeCounts').mockResolvedValue({});
    jest.spyOn(service as any, 'mergePublicResourceDiscussion').mockResolvedValue(0);
    const visibility = jest.spyOn(service, 'setResourceStorageVisibility').mockResolvedValue(undefined);
    await expect(service.mergeResource(7, 8, 42)).rejects.toThrow('merge audit failed');
    expect(visibility).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 7, status: 'merged', is_public: 0 }), 'private', manager);
    expect(visibility).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 8 }), 'public', manager);
    expect(visibility).toHaveBeenNthCalledWith(3, source, 'public');
    expect(visibility).toHaveBeenLastCalledWith(target, 'public');
  });
});

describe('RES unpublished version download authorization', () => {
  it('denies anonymous pending-version access on an approved resource and permits its owner', async () => {
    const service = Object.create(ResourcesService.prototype) as ResourcesService;
    const version = { id: 11, resource_id: 7, status: 'pending_review' };
    const file = { id: 31, storage_backend: 'res', availability_status: 'pending' };
    (service as any).versionRepository = { findOne: jest.fn().mockResolvedValue(version) };
    (service as any).resourceRepository = { findOne: jest.fn().mockResolvedValue({ id: 7, user_id: 10, status: 'approved', is_public: 1 }) };
    (service as any).resourceFileRepository = { findOne: jest.fn().mockResolvedValue(file) };
    (service as any).dataSource = { query: jest.fn().mockResolvedValue([]) };
    await expect(service.findStoredDownloadFile(7, 11)).rejects.toThrow('资源版本不存在');
    expect((service as any).resourceFileRepository.findOne).not.toHaveBeenCalled();
    await expect(service.findStoredDownloadFile(7, 11, { id: 10, role: 'member' })).resolves.toEqual({ version, file });
  });
});
