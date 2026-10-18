const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({
  HttpException: class HttpException extends Error {},
  HttpStatus: { BAD_REQUEST: 400 },
  Injectable: () => () => undefined,
  Global: () => () => undefined,
  Module: () => () => undefined,
  // Real implementations: the DI-token assertion below inspects the metadata
  // these two decorators record, so stubbing them out would make it vacuous.
  Optional: jest.requireActual('@nestjs/common').Optional,
  Inject: jest.requireActual('@nestjs/common').Inject,
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
  InjectDataSource: () => () => undefined,
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

import { BadRequestException } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { ResourceDependencyReadService } from './resource-dependency-read.service';
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
  dependencyRead?: Record<string, jest.Mock>;
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
    getRawMany: jest.fn().mockResolvedValue([]),
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
    undefined,
    undefined,
    undefined,
    overrides.dependencyRead as any,
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
  it('analyzes verified initial Mod bytes without downloading the RES object again', async () => {
    const { service } = createService();
    const read = jest.spyOn(service as any, 'readResUpload').mockRejectedValue(new Error('unexpected second RES read'));
    const bytes = Buffer.alloc(22);
    bytes.writeUInt32LE(0x06054b50, 0); // Valid empty ZIP; missing manifest remains a review finding.
    const result = await (service as any).prepareInitialModArchive('mod', 'upload', {
      version: '1.0.0', mod_id: 'demo',
    }, {
      file_name: 'demo.jar', file_size: bytes.length,
      storage_backend: 'res', provider_object_id: 'verified-object',
    }, false, bytes);
    expect(result).toMatchObject({ modId: 'demo', analysis: { manifest_path: null } });
    expect(read).not.toHaveBeenCalled();
  });

  it('resolves detail UUIDs while rejecting malformed and missing identifiers', async () => {
    const { service, resourceRepository } = createService();
    await expect(service.resolveDetailId('27')).resolves.toBe(27);
    expect(resourceRepository.findOne).not.toHaveBeenCalled();
    resourceRepository.findOne.mockResolvedValueOnce({ id: 27 });
    await expect(service.resolveDetailId('11111111-1111-4111-8111-111111111111')).resolves.toBe(27);
    await expect(service.resolveDetailId('1-invalid')).rejects.toThrow('资源编号无效');
    resourceRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.resolveDetailId('22222222-2222-4222-8222-222222222222')).rejects.toThrow('资源不存在');
  });

  it('honors explicit private visibility before issuing a file URL', async () => {
    const { service } = createService();
    await expect(service.isResourcePubliclyAccessible({ status: 'approved', is_public: 1, visibility: 'private' })).resolves.toBe(false);
  });

  it('keeps metadata-first draft Resources out of public detail and search results', async () => {
    const { service, resourceRepository } = createService();
    await expect(service.isResourcePubliclyAccessible({ status: 'draft', is_public: 1, visibility: 'public' })).resolves.toBe(false);
    await service.getPublicResources();
    expect(resourceRepository.createQueryBuilder().where).toHaveBeenCalledWith('resource.deleted_at IS NULL');
    expect(resourceRepository.createQueryBuilder().andWhere).toHaveBeenCalledWith(
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

  it('orders trending public resources from the last seven days of completed downloads, likes, and favorites', async () => {
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
    // The supported_version guard is asserted by schema in its own test below;
    // here it only has to prove the filter still reaches the query when it
    // travels with the other filters, without a second copy of the SQL literal
    // for the two to drift apart.
    const versionGuard = defaultQb.andWhere.mock.calls
      .map(([clause]) => String(clause))
      .find((clause) => clause.includes('resource_compatibilities'));
    expect(versionGuard).toBeDefined();
    expect(defaultQb.andWhere).toHaveBeenCalledWith(versionGuard, { supportedVersion: 'v8' });
    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      "JSON_CONTAINS(resource.metadata_json, JSON_QUOTE(:resourceCompatibility), '$.compatibility')",
      { resourceCompatibility: 'desktop' },
    );
  });

  // Issue #58: the Web readers must see modern-only releases, keep legacy-only
  // rows visible, and show a migrated mirror exactly once. The list filter is a
  // SQL guard (asserted on the query), the filter options and the detail rows
  // read through the shared modern-first projection.
  //
  // The assertions below pin the *schema-level* branch set (table names, then
  // the columns read through each table's own alias) rather than the alias
  // spelling, so removing a whole data source goes red while a self-consistent
  // alias rename — behaviourally identical SQL — does not. Renaming a *column*
  // does stay red: that is a behaviour change, not a cosmetic one.
  it('matches the supported_version filter against every compatibility source so a modern-only release stays visible', async () => {
    const { service, defaultQb } = createService();
    await service.getList({ limit: 20, supported_version: 'v8' } as any, { scope: 'public' });
    const sql = defaultQb.andWhere.mock.calls.map(([clause]) => String(clause)).find((clause) => clause.includes('supportedVersion')) as string;
    // Read each table through the alias the query itself chose: the branch has
    // to exist and read the right columns, but its alias is free.
    const aliasOf = (table: string) =>
      sql.match(new RegExp(`JOIN ${table} (\\w+) ON \\1\\.resource_version_id = rv\\.id`))?.[1];
    // Modern table: new releases write here (resource-versions.service.ts:491).
    const modernAlias = aliasOf('resource_compatibilities');
    expect(modernAlias).toBeDefined();
    expect(sql).toContain(`${modernAlias}.min_game_version`);
    expect(sql).toContain(`${modernAlias}.max_game_version`);
    // Legacy table: rows the migration has not mirrored stay searchable.
    const legacyAlias = aliasOf('resource_version_compatibilities');
    expect(legacyAlias).toBeDefined();
    expect(sql).toContain(`${legacyAlias}.min_version_value`);
    expect(sql).toContain(`${legacyAlias}.max_version_value`);
    // Version-bounded releases that never got a compatibility row, same branch
    // the search provider has (mdtbbs-search.providers.ts:89).
    const releaseAlias = sql.match(/FROM resource_versions (\w+) WHERE \1\.resource_id = resource\.id/)?.[1];
    expect(releaseAlias).toBeDefined();
    expect(sql).toContain(`${releaseAlias}.status = 'published'`);
    expect(sql).toContain(`${releaseAlias}.game_version_min = :supportedVersion`);
    expect(sql).toContain(`${releaseAlias}.game_version_max = :supportedVersion`);
    // Metadata fallback is unchanged.
    expect(sql).toContain("JSON_CONTAINS(resource.metadata_json, JSON_QUOTE(:supportedVersion), '$.supported_versions')");
    expect(defaultQb.andWhere).toHaveBeenCalledWith(sql, { supportedVersion: 'v8' });
    // Rename-sensitive invariant: every `:placeholder` in the guard must be
    // bound by the parameter object, and vice versa. A one-sided alias or
    // placeholder rename fails here instead of silently shipping broken SQL.
    const placeholders = [...sql.matchAll(/:(\w+)/g)].map((match) => match[1]);
    expect([...new Set(placeholders)]).toEqual(['supportedVersion']);
  });

  it('offers filter options from both compatibility tables', async () => {
    const { service, dataSource } = createService({
      dataSource: {
        query: jest.fn(async (sql: string) => (sql.includes('FROM resource_compatibilities rc')
          ? [{ min_version: '147', max_version: null, platform_key: 'desktop' }]
          : [{ min_version_value: null, max_version_value: '146', platform_key: null }])),
      },
    });

    const options = await service.getFilterOptions();

    const sqls = dataSource.query.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => sql.includes('FROM resource_compatibilities rc'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('FROM resource_version_compatibilities rvc'))).toBe(true);
    expect(options.supported_versions).toEqual(expect.arrayContaining(['147', '146']));
    expect(options.compatibility).toContain('desktop');
  });

  it('keeps legacy filter options when the modern table query fails mid-migration', async () => {
    const { service } = createService({
      dataSource: {
        query: jest.fn(async (sql: string) => {
          if (sql.includes('FROM resource_compatibilities rc')) throw new Error('Table does not exist');
          return [{ min_version_value: '136', max_version_value: null, platform_key: null }];
        }),
      },
    });

    const options = await service.getFilterOptions();

    expect(options.supported_versions).toContain('136');
  });

  // Issue #58 R1: `dependencyRead` is a constructor parameter typed by a class,
  // so the import must be a *value* import. `emitDecoratorMetadata` can only
  // emit the class reference if it survives to runtime; `import type` erases it
  // and the emitted token degrades to `Function`, which Nest cannot resolve —
  // `@Optional()` then swallows the failure and injects `undefined`, so the
  // shared projection never runs in production while every mocked suite stays
  // green (they hand the dependency in directly).
  //
  // Asserting on the *effective* token (explicit `@Inject` wins over the
  // emitted type) is deliberate: it lets an equivalent fix — `import type` plus
  // an explicit `@Inject(ResourceDependencyReadService)` — pass instead of
  // reporting a false regression.
  it('keeps a resolvable DI token for the shared compatibility projection', () => {
    const design: unknown[] = Reflect.getMetadata('design:paramtypes', ResourcesService) || [];
    const declared: Array<{ index: number; param: unknown }> = Reflect.getMetadata('self:paramtypes', ResourcesService) || [];
    // Effective token per parameter, in the module order: an explicit `@Inject`
    // overrides the type the compiler emitted.
    const effective = design.map((token, index) => declared.find((entry) => entry.index === index)?.param ?? token);

    expect(effective).toContain(ResourceDependencyReadService);
  });

  it('surfaces a modern-only version compatibility in the resource detail', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [{ id: 21, resource_id: 27, public_id: 'modern-version', version: '1.0.0', status: 'published' }];
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
      dependencyRead: {
        collectCompatibilities: jest.fn(async () => new Map([[21, [{
          resource_version_id: 21, runtime: 'mindustry', game_version: null,
          min_version: '147', max_version: null, channel: 'release', platform_key: 'desktop',
          status: 'declared', source: 'analyzer', confidence: 'medium', notes: null, origin: 'modern',
        }]]])),
      },
    });

    const detail = await service.getByIdWithVersions(27);

    expect(detail.versions[0].compatibility).toEqual([
      expect.objectContaining({ runtime: 'mindustry', min_version_value: '147', max_version_value: null, provenance: 'inferred', confidence: 'medium' }),
    ]);
  });

  it('keeps a legacy-only version compatibility visible and maps its provenance unchanged', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [{ id: 21, resource_id: 27, public_id: 'legacy-version', version: '1.0.0', status: 'published' }];
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
      dependencyRead: {
        collectCompatibilities: jest.fn(async () => new Map([[21, [{
          resource_version_id: 21, runtime: 'mindustry', game_version: 'v7',
          min_version: '136', max_version: '146', channel: null, platform_key: null,
          status: null, source: 'user_declared', confidence: null, notes: 'legacy note', origin: 'legacy',
        }]]])),
      },
    });

    const detail = await service.getByIdWithVersions(27);

    expect(detail.versions[0].compatibility).toEqual([
      expect.objectContaining({ min_version_value: '136', max_version_value: '146', notes: 'legacy note', provenance: 'user_declared', confidence: null }),
    ]);
  });

  it('shows no duplicate row for a mixed dataset the projection already de-duplicated', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [{ id: 21, resource_id: 27, public_id: 'mixed-version', version: '1.0.0', status: 'published' }];
    // The shared projection collapses a double-written pair to one modern row.
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
      dependencyRead: {
        collectCompatibilities: jest.fn(async () => new Map([[21, [{
          resource_version_id: 21, runtime: 'mindustry', game_version: null,
          min_version: '146', max_version: null, channel: 'release', platform_key: null,
          status: 'declared', source: 'author', confidence: null, notes: null, origin: 'modern',
        }]]])),
      },
    });

    const detail = await service.getByIdWithVersions(27);

    expect(detail.versions[0].compatibility).toHaveLength(1);
    expect(detail.versions[0].compatibility[0]).toMatchObject({ min_version_value: '146', provenance: 'user_declared' });
  });

  it('de-duplicates a mirrored legacy row through the real projection and keeps a distinct constraint', async () => {
    // End-to-end over the actual shared projection: version 21 is modern-only,
    // version 22 is a legacy-only row, version 23 is a double-written mirror
    // plus one genuinely distinct legacy constraint. Acceptance #1/#2 read.
    const tables = ['resource_compatibilities', 'resource_version_compatibilities'];
    const dataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('information_schema.tables')) {
          return tables.includes(String(params[0])) ? [{ present: 1 }] : [];
        }
        if (sql.includes('FROM resource_compatibilities')) {
          return [
            { id: 1, resource_version_id: 21, runtime: 'mindustry', game_version: null, min_game_version: '147', max_game_version: null, channel: 'release', platform_key: 'desktop', status: 'declared', source: 'analyzer', confidence: 'medium', notes: null },
            { id: 2, resource_version_id: 23, runtime: 'mindustry', game_version: null, min_game_version: '146', max_game_version: null, channel: 'release', platform_key: null, status: 'declared', source: 'author', confidence: null, notes: null },
          ];
        }
        if (sql.includes('FROM resource_version_compatibilities')) {
          const channel = new Map<number, string>([[23, 'release']]);
          return [
            { id: 3, resource_version_id: 22, runtime: 'mindustry', game_series: null, min_version_value: '136', max_version_value: '145', channel: null, platform_key: null, provenance: 'user_declared', confidence: null, notes: null, version_release_channel: null },
            { id: 4, resource_version_id: 23, runtime: 'mindustry', game_series: null, min_version_value: '146', max_version_value: null, channel: null, platform_key: null, provenance: 'user_declared', confidence: null, notes: null, version_release_channel: channel.get(23) },
            { id: 5, resource_version_id: 23, runtime: 'mindustry', game_series: null, min_version_value: '148', max_version_value: null, channel: null, platform_key: null, provenance: 'user_declared', confidence: null, notes: null, version_release_channel: channel.get(23) },
          ];
        }
        return [];
      }),
    };
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [
      { id: 21, resource_id: 27, public_id: 'modern-only', version: '1.0.0', status: 'published' },
      { id: 22, resource_id: 27, public_id: 'legacy-only', version: '1.1.0', status: 'published' },
      { id: 23, resource_id: 27, public_id: 'mirrored', version: '1.2.0', status: 'published' },
    ];
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
      dataSource,
      dependencyRead: new ResourceDependencyReadService(dataSource as any) as any,
    });

    const detail = await service.getByIdWithVersions(27);
    const byPublicId = new Map<string, any[]>((detail.versions as any[]).map((version) => [version.public_id, version.compatibility]));

    expect(byPublicId.get('modern-only')).toEqual([
      expect.objectContaining({ min_version_value: '147', provenance: 'inferred' }),
    ]);
    expect(byPublicId.get('legacy-only')).toEqual([
      expect.objectContaining({ min_version_value: '136', max_version_value: '145', provenance: 'user_declared' }),
    ]);
    // Mirror collapsed to one row; the distinct 148 constraint stays.
    expect(byPublicId.get('mirrored')).toHaveLength(2);
    expect(byPublicId.get('mirrored')?.map((item) => item.min_version_value)).toEqual(['146', '148']);
  });

  // Issue #58 B1: `collectCompatibilities` deliberately keeps `channel` and
  // `confidence` in its content key so V2 can tell two declarations apart, but
  // this detail DTO exposes neither as a dimension. The two writers disagree by
  // construction (`channel` NULL on the legacy row vs `dto.release_channel ||
  // 'release'` on the double-write at resources.service.ts:946/:991, and the
  // renderer `confidence` only on the legacy row), so the same declared
  // constraint arrives twice unless the detail path collapses it. Every
  // assertion below goes red on the previous behaviour.
  it('shows one detail row for a constraint the two writers restated with their own channel and confidence', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [{ id: 23, resource_id: 27, public_id: 'schematic', version: '1.0.0', status: 'published' }];
    const tables = ['resource_compatibilities', 'resource_version_compatibilities'];
    const dataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('information_schema.tables')) return tables.includes(String(params[0])) ? [{ present: 1 }] : [];
        if (sql.includes('FROM resource_compatibilities')) {
          // The app double-write for the submitter's declaration: channel is the
          // release channel, confidence is unknown to that writer.
          return [{ id: 1, resource_version_id: 23, runtime: 'mindustry', game_version: null, min_game_version: '145', max_game_version: null, channel: 'release', platform_key: null, status: 'declared', source: 'author', confidence: null, notes: '基于蓝图内容自动推测' }];
        }
        if (sql.includes('FROM resource_version_compatibilities')) {
          // The renderer inference row: no channel, real confidence.
          return [{ id: 4, resource_version_id: 23, runtime: 'mindustry', game_series: null, min_version_value: '145', max_version_value: null, channel: null, platform_key: null, provenance: 'inferred', confidence: 'high', notes: '基于蓝图内容自动推测', version_release_channel: 'release' }];
        }
        return [];
      }),
    };
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
      dataSource,
      dependencyRead: new ResourceDependencyReadService(dataSource as any) as any,
    });

    const detail = await service.getByIdWithVersions(27);
    const rows = detail.versions[0].compatibility;

    // One declared constraint, one row — not a legacy + modern pair.
    expect(rows).toHaveLength(1);
    // The renderer's own evidence is the one that survives, never the writer's
    // default confidence the submitter never declared.
    expect(rows[0]).toMatchObject({ min_version_value: '145', provenance: 'inferred', confidence: 'high' });
    // The internal writer discriminator is used for collapsing only and must
    // never reach the public payload: the Web contract is unchanged by #77.
    expect(Object.keys(rows[0]).sort()).toEqual([
      'channel', 'confidence', 'max_version_value', 'min_version_value', 'notes', 'provenance', 'runtime',
    ]);
  });

  // Issue #58 B1, second shape: within the modern table alone, the app
  // double-writes the submitter's declaration (`channel = release_channel ||
  // 'release'`) while `persistMapAnalysis` independently stores the renderer's
  // range for the same version — same bounds, two rows, neither a legacy row.
  it('collapses two modern writers that recorded the same bounds for one declaration', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [{ id: 23, resource_id: 27, public_id: 'map', version: '1.0.0', status: 'published' }];
    const tables = ['resource_compatibilities', 'resource_version_compatibilities'];
    const dataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('information_schema.tables')) return tables.includes(String(params[0])) ? [{ present: 1 }] : [];
        if (sql.includes('FROM resource_compatibilities')) {
          return [
            { id: 1, resource_version_id: 23, runtime: 'mindustry', game_version: null, min_game_version: '145', max_game_version: null, channel: 'release', platform_key: null, status: 'declared', source: 'author', confidence: null, notes: null },
            // `persistMapAnalysis` writes the renderer's range as source
            // 'author' with channel/confidence NULL (resource-version-analysis.persistence.ts:119).
            { id: 2, resource_version_id: 23, runtime: 'mindustry', game_version: null, min_game_version: '145', max_game_version: null, channel: null, platform_key: null, status: 'declared', source: 'author', confidence: null, notes: null },
          ];
        }
        if (sql.includes('FROM resource_version_compatibilities')) return [];
        return [];
      }),
    };
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
      dataSource,
      dependencyRead: new ResourceDependencyReadService(dataSource as any) as any,
    });

    const detail = await service.getByIdWithVersions(27);
    expect(detail.versions[0].compatibility).toHaveLength(1);
    expect(detail.versions[0].compatibility[0]).toMatchObject({ min_version_value: '145', provenance: 'user_declared' });
  });

  // Same collapse, but the two modern rows do not agree on what is known about
  // the constraint: one carries the analyzer's evidence, the other only the
  // writer's defaults. Folding them must keep the row that actually knows
  // something — the renderer `confidence` and the `analyzer` provenance are the
  // whole point of surfacing this section, and a writer default must not be
  // allowed to overwrite them.
  it('keeps the analyzer evidence when two modern rows restate one constraint with different confidence', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [{ id: 23, resource_id: 27, public_id: 'schematic', version: '1.0.0', status: 'published' }];
    const tables = ['resource_compatibilities', 'resource_version_compatibilities'];
    const dataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('information_schema.tables')) return tables.includes(String(params[0])) ? [{ present: 1 }] : [];
        if (sql.includes('FROM resource_compatibilities')) {
          return [
            // The submitter's double-write: channel only, nothing learned.
            { id: 1, resource_version_id: 23, runtime: 'mindustry', game_version: null, min_game_version: '145', max_game_version: null, channel: 'release', platform_key: null, status: 'declared', source: 'author', confidence: null, notes: null },
            // The analyzer's own row for the same bounds (`analyzer` is what the
            // Resource Center migration derives from `inferred`).
            { id: 2, resource_version_id: 23, runtime: 'mindustry', game_version: null, min_game_version: '145', max_game_version: null, channel: null, platform_key: null, status: 'declared', source: 'analyzer', confidence: 'high', notes: null },
          ];
        }
        if (sql.includes('FROM resource_version_compatibilities')) return [];
        return [];
      }),
    };
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
      dataSource,
      dependencyRead: new ResourceDependencyReadService(dataSource as any) as any,
    });

    const detail = await service.getByIdWithVersions(27);

    expect(detail.versions[0].compatibility).toHaveLength(1);
    expect(detail.versions[0].compatibility[0]).toMatchObject({
      min_version_value: '145', provenance: 'inferred', confidence: 'high',
    });
  });

  // Two `dto.compatibility` entries can share bounds and still be separate
  // declarations if the submitter gave them different channels; those must not
  // be merged just because this DTO does not filter on channel.
  // Before the detail path was unified the Web page read the legacy table
  // alone, so a legacy-only dataset must come out of the new path unchanged —
  // including two legacy rows that happen to share bounds.
  it('leaves legacy-only detail rows untouched', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [{ id: 23, resource_id: 27, public_id: 'legacy', version: '1.0.0', status: 'published' }];
    const tables = ['resource_compatibilities', 'resource_version_compatibilities'];
    const dataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('information_schema.tables')) return tables.includes(String(params[0])) ? [{ present: 1 }] : [];
        if (sql.includes('FROM resource_compatibilities')) return [];
        if (sql.includes('FROM resource_version_compatibilities')) {
          return [
            { id: 4, resource_version_id: 23, runtime: 'mindustry', game_series: null, min_version_value: '146', max_version_value: null, channel: 'release', platform_key: null, provenance: 'user_declared', confidence: null, notes: null, version_release_channel: 'release' },
            { id: 5, resource_version_id: 23, runtime: 'mindustry', game_series: null, min_version_value: '146', max_version_value: null, channel: null, platform_key: null, provenance: 'inferred', confidence: 'high', notes: null, version_release_channel: 'release' },
          ];
        }
        return [];
      }),
    };
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
      dataSource,
      dependencyRead: new ResourceDependencyReadService(dataSource as any) as any,
    });

    const detail = await service.getByIdWithVersions(27);
    expect(detail.versions[0].compatibility).toHaveLength(2);
    expect(detail.versions[0].compatibility.map((item: any) => item.provenance).sort()).toEqual(['inferred', 'user_declared']);
  });

  // Issue #58 R2: the legacy table is read with `ORDER BY id ASC` and the page
  // renders the array as it arrives, so collapsing must not regroup the rows it
  // keeps. Two legacy rows sharing bounds with a different row between them is
  // the shape that a group-then-emit implementation silently reorders.
  it('keeps the detail row order the projection returned', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [{ id: 23, resource_id: 27, public_id: 'ordered', version: '1.0.0', status: 'published' }];
    const tables = ['resource_compatibilities', 'resource_version_compatibilities'];
    const dataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('information_schema.tables')) return tables.includes(String(params[0])) ? [{ present: 1 }] : [];
        if (sql.includes('FROM resource_compatibilities')) {
          // The projection returns modern rows first, then the legacy rows the
          // modern table did not copy. Bound 146 shows up in all of them, so a
          // group-then-emit collapse pulls the two 146 legacy rows together and
          // pushes 136 behind them.
          return [
            { id: 1, resource_version_id: 23, runtime: 'mindustry', game_version: null, min_game_version: '146', max_game_version: null, channel: null, platform_key: null, status: 'declared', source: 'analyzer', confidence: 'high', notes: null },
            { id: 2, resource_version_id: 23, runtime: 'mindustry', game_version: null, min_game_version: '146', max_game_version: null, channel: 'release', platform_key: null, status: 'declared', source: 'author', confidence: null, notes: null },
          ];
        }
        if (sql.includes('FROM resource_version_compatibilities')) {
          return [
            { id: 4, resource_version_id: 23, runtime: 'mindustry', game_series: null, min_version_value: '146', max_version_value: null, channel: null, platform_key: null, provenance: 'user_declared', confidence: null, notes: null, version_release_channel: 'release' },
            { id: 5, resource_version_id: 23, runtime: 'mindustry', game_series: null, min_version_value: '136', max_version_value: null, channel: null, platform_key: null, provenance: 'user_declared', confidence: null, notes: null, version_release_channel: null },
            { id: 6, resource_version_id: 23, runtime: 'mindustry', game_series: null, min_version_value: '146', max_version_value: null, channel: 'release', platform_key: null, provenance: 'user_declared', confidence: null, notes: null, version_release_channel: 'release' },
          ];
        }
        return [];
      }),
    };
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
      dataSource,
      dependencyRead: new ResourceDependencyReadService(dataSource as any) as any,
    });

    const detail = await service.getByIdWithVersions(27);
    const bounds = detail.versions[0].compatibility.map((item: any) => item.min_version_value);

    // Modern row 2 restates legacy row 6 and drops out; modern row 1 keeps its
    // position in front of the two legacy rows that survive.
    expect(bounds).toEqual(['146', '136', '146']);
    expect(detail.versions[0].compatibility.map((item: any) => item.provenance)).toEqual(['inferred', 'user_declared', 'user_declared']);
  });

  it('keeps both modern declarations when they differ by explicit channel', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [{ id: 23, resource_id: 27, public_id: 'channels', version: '1.0.0', status: 'published' }];
    const tables = ['resource_compatibilities', 'resource_version_compatibilities'];
    const dataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('information_schema.tables')) return tables.includes(String(params[0])) ? [{ present: 1 }] : [];
        if (sql.includes('FROM resource_compatibilities')) {
          return [
            { id: 1, resource_version_id: 23, runtime: 'mindustry', game_version: null, min_game_version: '146', max_game_version: null, channel: 'release', platform_key: null, status: 'declared', source: 'author', confidence: null, notes: null },
            { id: 2, resource_version_id: 23, runtime: 'mindustry', game_version: null, min_game_version: '146', max_game_version: null, channel: 'beta', platform_key: null, status: 'declared', source: 'author', confidence: null, notes: null },
          ];
        }
        if (sql.includes('FROM resource_version_compatibilities')) return [];
        return [];
      }),
    };
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
      dataSource,
      dependencyRead: new ResourceDependencyReadService(dataSource as any) as any,
    });

    const detail = await service.getByIdWithVersions(27);
    expect(detail.versions[0].compatibility).toHaveLength(2);
    expect(detail.versions[0].compatibility.map((item: any) => item.channel).sort()).toEqual(['beta', 'release']);
  });

  it('keeps two detail rows when the two writers record genuinely different channels', async () => {
    const resource = { id: 27, user_id: 9, status: 'approved', is_public: 1, category_id: null, user: null, category: null };
    const versions = [{ id: 23, resource_id: 27, public_id: 'two-channels', version: '1.0.0', status: 'published' }];
    const tables = ['resource_compatibilities', 'resource_version_compatibilities'];
    const dataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('information_schema.tables')) return tables.includes(String(params[0])) ? [{ present: 1 }] : [];
        if (sql.includes('FROM resource_compatibilities')) {
          return [{ id: 1, resource_version_id: 23, runtime: 'mindustry', game_version: null, min_game_version: '146', max_game_version: null, channel: 'beta', platform_key: null, status: 'declared', source: 'author', confidence: null, notes: null }];
        }
        if (sql.includes('FROM resource_version_compatibilities')) {
          return [{ id: 4, resource_version_id: 23, runtime: 'mindustry', game_series: null, min_version_value: '146', max_version_value: null, channel: 'alpha', platform_key: null, provenance: 'user_declared', confidence: null, notes: null, version_release_channel: 'release' }];
        }
        return [];
      }),
    };
    const { service } = createService({
      resourceRepository: { findOne: jest.fn().mockResolvedValue(resource) },
      versionRepository: { find: jest.fn().mockResolvedValue(versions) },
      dataSource,
      dependencyRead: new ResourceDependencyReadService(dataSource as any) as any,
    });

    const detail = await service.getByIdWithVersions(27);
    expect(detail.versions[0].compatibility).toHaveLength(2);
    expect(detail.versions[0].compatibility.map((item: any) => item.channel).sort()).toEqual(['alpha', 'beta']);
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

    // First approval is also the publication event, so it stamps published_at.
    expect(manager.update).toHaveBeenCalledWith(expect.anything(), 22, expect.objectContaining({
      status: 'approved',
      reject_reason: null,
      published_at: expect.any(Date),
    }));
    expect(adminNotificationsService.publishModerationResult).toHaveBeenCalledWith({
      item_type: 'resource',
      item_id: 22,
      action: 'approved',
      actor_username: 'moderatorA',
      subject: 'Useful Pack',
      action_url: '/admin/resources?status=approved',
    });
  });

  it('keeps the original publication date when an already-published resource is re-approved', async () => {
    const original = new Date('2026-06-01T08:00:00.000Z');
    const { service, manager } = createService({
      resourceRepository: {
        findOne: jest.fn()
          .mockResolvedValueOnce({
            id: 33, title: 'Old Pack', status: 'pending', is_public: 1, file_size: 64,
            published_at: original,
            created_at: new Date('2026-06-01T07:00:00.000Z'),
            updated_at: new Date('2026-09-01T00:00:00.000Z'),
            user: { username: 'bob' }, category: null,
          })
          .mockResolvedValueOnce({
            id: 33, title: 'Old Pack', status: 'approved', is_public: 1, file_size: 64,
            published_at: original,
            created_at: new Date('2026-06-01T07:00:00.000Z'),
            updated_at: new Date('2026-10-08T00:00:00.000Z'),
            user: { username: 'bob' }, category: null,
          }),
      },
    });

    await service.updateStatus(33, 'approved', { actorUsername: 'moderatorA' });

    const [, , updateData] = manager.update.mock.calls[0];
    expect(updateData).not.toHaveProperty('published_at');
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

describe('bare download version resolution', () => {
  it('follows the latest_published pointer when it diverges from the newest published row', async () => {
    // Forked state: the pointer names v31 while a merged-in v9 carries a newer
    // published_at, so "newest published row" is v9. A bare request streams the
    // pointer row's bytes (getForFileAccess rewrote the path from that same
    // pointer), so the resolution must name v31 — not v9, whose file never left
    // the server. Reverting to a plain "newest published_at" query must fail here.
    const service = Object.create(ResourcesService.prototype) as ResourcesService;
    const pointed = { id: 31, resource_id: 7, status: 'published', file_path: '/files/pointer-v31.msav' };
    const newest = { id: 9, resource_id: 7, status: 'published', file_path: '/files/merged-v9.msav' };
    (service as any).resourceRepository = { findOne: jest.fn().mockResolvedValue({ id: 7, latest_published_version_id: 31 }) };
    (service as any).versionRepository = {
      findOne: jest.fn().mockResolvedValue(pointed),
      find: jest.fn().mockResolvedValue([newest]),
    };
    (service as any).resourceFileRepository = { findOne: jest.fn().mockResolvedValue({ id: 42 }) };

    await expect(service.findStoredDownloadFile(7)).resolves.toEqual({ version: pointed, file: { id: 42 } });
    // The pointer only counts when it names a published row of this resource —
    // the same query getForFileAccess rewrites the streamed path from.
    expect((service as any).versionRepository.findOne).toHaveBeenCalledWith({ where: { id: 31, resource_id: 7, status: 'published' } });
    expect((service as any).versionRepository.find).not.toHaveBeenCalled();
  });

  it('falls back to the newest published row when the pointer names no published version', async () => {
    const service = Object.create(ResourcesService.prototype) as ResourcesService;
    const newest = { id: 9, resource_id: 7, status: 'published', file_path: '/files/merged-v9.msav' };
    (service as any).resourceRepository = { findOne: jest.fn().mockResolvedValue({ id: 7, latest_published_version_id: 31 }) };
    (service as any).versionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([newest]),
    };
    (service as any).resourceFileRepository = { findOne: jest.fn().mockResolvedValue({ id: 99 }) };

    await expect(service.findStoredDownloadFile(7)).resolves.toEqual({ version: newest, file: { id: 99 } });
  });
});

/**
 * Issue #65 — `mergeResource` version-collision evidence.
 *
 * The fixture replays the statements `mergeResource` issues (the twin remaps and
 * the dependency target pointer) against in-memory tables, so the assertions
 * read post-merge row state, then feed that state to the *real* reader
 * (`ResourceDependencyReadService`). `remap: 'legacy-only'` drops the modern-table
 * remaps, which is the pre-fix write path — that is what gives the regression
 * test its discriminating power.
 *
 * The table shapes mirror the two real writers: the V2 migration mirrors every
 * legacy row into its modern twin with the same `resource_version_id` and
 * `legacy_source_id = legacy.id`; application-side compatibility writes are
 * double-writes (legacy `channel` NULL, modern `channel` from `release_channel`)
 * and application-side dependency writes are modern-only.
 *
 * Needs Verification (Issue #65 C2 — no MySQL here): real EXPLAIN, real row
 * counts and large version-set performance.
 */
describe('ResourcesService mergeResource version-collision evidence (Issue #65)', () => {
  type Row = Record<string, any>;

  const TWIN_PAIRS: Array<[string, string]> = [
    ['resource_version_dependencies', 'resource_dependencies'],
    ['resource_version_compatibilities', 'resource_compatibilities'],
  ];
  const MODERN_TWIN_TABLES = TWIN_PAIRS.map(([, modern]) => modern);

  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

  function makeStore(input: {
    sourceId: number;
    targetId: number;
    versions: Row[];
    files?: Row[];
    dependencies?: Row[];
    compatibilities?: Row[];
  }) {
    const resources = [
      { id: input.sourceId, status: 'approved', is_public: 1, visibility: 'public' },
      { id: input.targetId, status: 'approved', is_public: 1, visibility: 'public' },
    ].map((row) => ({
      deleted_at: null, merged_into_resource_id: null, rating_count: 0, rating_sum: 0,
      download_count: 0, view_count: 0, latest_published_version_id: null, metadata_json: '{}',
      ...row,
    }));
    const split = (rows: Row[] | undefined) => ({
      legacy: clone((rows || []).filter((row) => row.origin === 'legacy')),
      modern: clone((rows || []).filter((row) => row.origin === 'modern')),
    });
    const dependencies = split(input.dependencies);
    const compatibilities = split(input.compatibilities);
    return {
      resources,
      resource_versions: clone(input.versions),
      resource_files: clone(input.files || []),
      resource_version_dependencies: dependencies.legacy,
      resource_dependencies: dependencies.modern,
      resource_version_compatibilities: compatibilities.legacy,
      resource_compatibilities: compatibilities.modern,
    } as Record<string, Row[]>;
  }

  /** Executes the merge SQL against the in-memory tables. */
  function createExecutor(store: Record<string, Row[]>, remap: 'symmetric' | 'legacy-only') {
    const mergeLogs: Row[] = [];
    const query = async (sql: string, params: any[] = []): Promise<any> => {
      const text = String(sql).replace(/\s+/g, ' ').trim();

      if (text.includes('information_schema.tables')) return Object.keys(store).map((table_name) => ({ table_name }));
      if (/^SELECT \* FROM resources WHERE id IN/.test(text)) {
        return store.resources.filter((row) => params.includes(Number(row.id)));
      }
      if (/^SELECT COUNT\(\*\) AS count/.test(text)) return [{ count: 0, total: 0 }];
      if (/^SELECT id, version, status FROM resource_versions/.test(text)) {
        return store.resource_versions.filter((row) => Number(row.resource_id) === Number(params[0]));
      }
      if (/^UPDATE resource_files SET resource_version_id = \?/.test(text)) {
        const [to, from] = params.map(Number);
        const rows = store.resource_files.filter((row) => Number(row.resource_version_id) === from && row.availability_status === 'available');
        rows.forEach((row) => { row.resource_version_id = to; });
        return { affectedRows: rows.length };
      }
      if (/^UPDATE resources SET status = 'merged'/.test(text)) {
        const row = store.resources.find((item) => Number(item.id) === Number(params[1]));
        if (row) { row.status = 'merged'; row.is_public = 0; row.merged_into_resource_id = Number(params[0]); }
        return { affectedRows: row ? 1 : 0 };
      }
      if (/^INSERT INTO resource_merge_logs/.test(text)) {
        mergeLogs.push({ migrated_counts: JSON.parse(params[3]) });
        return { affectedRows: 1 };
      }
      const single = text.match(/^UPDATE (\w+) SET (\w+) = \? WHERE (\w+) = \?$/);
      const many = text.match(/^UPDATE (\w+) SET (\w+) = \? WHERE (\w+) IN \(([?,\s]+)\)$/);
      if (single || many) {
        const match = (single || many) as RegExpMatchArray;
        const [table, column, key] = [match[1], match[2], match[3]];
        if (!store[table]) return { affectedRows: 0 };
        // Pre-fix path: nothing ever remapped the modern twins.
        if (remap === 'legacy-only' && MODERN_TWIN_TABLES.includes(table)) return { affectedRows: 0 };
        const to = params[0];
        const from = new Set((many ? params.slice(1) : [params[1]]).map(Number));
        const rows = store[table].filter((row) => from.has(Number(row[key])));
        rows.forEach((row) => { row[column] = to; });
        return { affectedRows: rows.length };
      }
      if (/^SELECT/.test(text)) return [];
      return { affectedRows: 0 };
    };
    return { query, mergeLogs };
  }

  async function runMerge(input: { store: Record<string, Row[]>; remap: 'symmetric' | 'legacy-only'; sourceId: number; targetId: number }) {
    const service = Object.create(ResourcesService.prototype) as ResourcesService;
    const executor = createExecutor(input.store, input.remap);
    const manager: any = {
      query: executor.query,
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue({}),
      }),
    };
    (service as any).dataSource = { transaction: jest.fn(async (callback: any) => callback(manager)) };
    jest.spyOn(service as any, 'resourceMergeCounts').mockResolvedValue({});
    jest.spyOn(service as any, 'mergePublicResourceDiscussion').mockResolvedValue(0);
    jest.spyOn(service, 'setResourceStorageVisibility').mockResolvedValue(undefined);
    const result = await service.mergeResource(input.sourceId, input.targetId, 42);
    return { result, store: input.store, mergeLogs: executor.mergeLogs };
  }

  /** Feeds post-merge tables to the real read projection. */
  function createReader(store: Record<string, Row[]>) {
    const dataSource = {
      query: jest.fn(async (sql: string, params: number[] = []) => {
        const text = String(sql);
        if (text.includes('information_schema.tables')) return store[String(params[0])] ? [{ present: 1 }] : [];
        const onVersions = (rows: Row[]) => rows.filter((row) => params.includes(Number(row.resource_version_id)));
        if (text.includes('FROM resource_version_dependencies')) {
          const copied = new Set((store.resource_dependencies || []).map((row) => row.legacy_source_id).filter(Boolean));
          return onVersions(store.resource_version_dependencies || []).filter((row) => !copied.has(row.id));
        }
        if (text.includes('FROM resource_version_compatibilities')) {
          const channels = new Map((store.resource_versions || []).map((row) => [Number(row.id), row.release_channel ?? null]));
          return onVersions(store.resource_version_compatibilities || [])
            .map((row) => ({ ...row, version_release_channel: channels.get(Number(row.resource_version_id)) ?? null }));
        }
        if (text.includes('FROM resource_dependencies')) return onVersions(store.resource_dependencies || []);
        if (text.includes('FROM resource_compatibilities')) return onVersions(store.resource_compatibilities || []);
        return [];
      }),
    };
    return new ResourceDependencyReadService(dataSource as any);
  }

  /** Compatibility rows read as `<origin>:<constraint>`, dependency rows as `<source>#<target>` (the target id, `null` when unset). */
  const labels = (rows: Row[]) => rows.map((row) => row.origin
    ? `${row.origin}:${row.game_version ?? row.min_version ?? 'none'}`
    : `${row.source}#${row.target_resource_id ?? 'null'}`);

  /** A1 invariant: every legacy row and its modern twin sit on the same version. */
  function twinSymmetryViolations(store: Record<string, Row[]>) {
    const violations: string[] = [];
    for (const [legacyTable, modernTable] of TWIN_PAIRS) {
      for (const legacy of store[legacyTable] || []) {
        const twin = (store[modernTable] || []).find((row) => Number(row.legacy_source_id) === Number(legacy.id));
        if (twin && Number(twin.resource_version_id) !== Number(legacy.resource_version_id)) {
          violations.push(`${modernTable}#${twin.id} is on v${twin.resource_version_id} while its legacy row is on v${legacy.resource_version_id}`);
        }
      }
    }
    return violations;
  }

  /** ④: no evidence row may stay on a version owned by the merged-away resource. */
  function rowsOnMergedSource(store: Record<string, Row[]>) {
    const mergedIds = new Set(store.resources.filter((row) => row.merged_into_resource_id).map((row) => Number(row.id)));
    const versionOwner = new Map(store.resource_versions.map((row) => [Number(row.id), Number(row.resource_id)]));
    return [...TWIN_PAIRS.flat()].flatMap((table) =>
      (store[table] || []).filter((row) => mergedIds.has(versionOwner.get(Number(row.resource_version_id)) as number)));
  }

  /**
   * Both resources publish the same display version "1.0": the collision case.
   * Target v100 declares constraint 146 and depends on resource 6; source v200
   * declares 147 and depends on resource 8 (which is the merged-away source
   * itself, i.e. the target pointer K1 governs).
   */
  const baseInput = {
    sourceId: 8,
    targetId: 7,
    versions: [
      { id: 200, resource_id: 8, version: '1.0', status: 'published', release_channel: 'release' },
      { id: 100, resource_id: 7, version: '1.0', status: 'published', release_channel: 'release' },
    ],
    compatibilities: [
      // Target side: the application double-write (legacy has no channel, modern takes release_channel).
      { id: 11, origin: 'legacy', resource_version_id: 100, runtime: 'mindustry', min_version_value: '146', max_version_value: '146', channel: null, provenance: 'user_declared' },
      { id: 1, origin: 'modern', resource_version_id: 100, runtime: 'mindustry', min_game_version: '146', max_game_version: '146', channel: 'release', source: 'author', legacy_source_id: 11 },
      // Source side: the same pair, declaring a different constraint.
      { id: 12, origin: 'legacy', resource_version_id: 200, runtime: 'mindustry', min_version_value: '147', max_version_value: '147', channel: null, provenance: 'user_declared' },
      { id: 2, origin: 'modern', resource_version_id: 200, runtime: 'mindustry', min_game_version: '147', max_game_version: '147', channel: 'release', source: 'author', legacy_source_id: 12 },
    ],
    dependencies: [
      // Target side: application-side dependency, modern-only (legacy_source_id NULL).
      { id: 3, origin: 'modern', resource_version_id: 100, dependency_type: 'required', target_resource_id: 6, sort_order: 0, external_identifier: 'target-lib', legacy_source_id: null },
      // Source side: a migrated pair whose target is the resource being merged away.
      { id: 32, origin: 'legacy', resource_version_id: 200, dependency_type: 'required', target_resource_id: 8, sort_order: 0, external_identifier: 'source-lib' },
      { id: 4, origin: 'modern', resource_version_id: 200, dependency_type: 'required', target_resource_id: 8, sort_order: 0, external_identifier: 'source-lib', legacy_source_id: 32 },
    ],
    files: [{ id: 51, resource_version_id: 200, availability_status: 'available', role: 'primary' }],
  };

  const collisionFixture = () => makeStore(clone(baseInput));

  /**
   * The A1 assertion set, in one place so the regression test can show that the
   * pre-fix write path makes exactly these assertions fail.
   */
  async function assertCollisionRemapped(store: Record<string, Row[]>) {
    expect(store.resource_version_compatibilities.map((row) => row.resource_version_id)).toEqual([100, 100]);
    expect(store.resource_compatibilities.map((row) => row.resource_version_id)).toEqual([100, 100]);
    // Dependencies: the target side is modern-only (app-side writes never touch the
    // legacy table), so only the migrated source row has a legacy twin to move.
    expect(store.resource_version_dependencies.map((row) => row.resource_version_id)).toEqual([100]);
    expect(store.resource_dependencies.map((row) => row.resource_version_id)).toEqual([100, 100]);
    expect(twinSymmetryViolations(store)).toEqual([]);

    // K1: the copies that pointed at the merged-away resource now point at the target.
    const targets = (rows: Row[]) => rows.map((row) => [row.external_identifier, row.target_resource_id]);
    expect(targets(store.resource_version_dependencies)).toEqual([['source-lib', 7]]);
    expect(targets(store.resource_dependencies)).toEqual([['target-lib', 6], ['source-lib', 7]]);

    const reader = createReader(store);
    // Union of both sides' declarations, every row projected from the modern table.
    expect(labels((await reader.collectCompatibilities([100])).get(100)!)).toEqual(['modern:146', 'modern:147']);
    // Union of both sides' dependencies — the source-side one is not swallowed.
    expect(labels((await reader.collectDependencies([100])).get(100)!)).toEqual(['modern#6', 'modern#7']);
  }

  it('A1: remaps both legacy tables and their modern twins onto the target version', async () => {
    const store = collisionFixture();
    await runMerge({ store, remap: 'symmetric', ...baseInput });
    await assertCollisionRemapped(store);
  });

  it('A2: equal constraints on both sides read back as two modern rows, never a legacy residue', async () => {
    const equal = clone(baseInput);
    equal.compatibilities = clone(baseInput.compatibilities).map((row) => {
      if (row.resource_version_id !== 200) return row;
      return row.origin === 'legacy'
        ? { ...row, min_version_value: '146', max_version_value: '146' }
        : { ...row, min_game_version: '146', max_game_version: '146' };
    });

    const store = makeStore(equal);
    await runMerge({ store, remap: 'symmetric', ...baseInput });
    const reader = createReader(store);
    // Two genuine declarations: the row count is the union, not the pre-merge count.
    expect(labels((await reader.collectCompatibilities([100])).get(100)!)).toEqual(['modern:146', 'modern:146']);

    // The pre-fix path leaves a legacy residue on the same data.
    const legacyOnly = makeStore(clone(equal));
    await runMerge({ store: legacyOnly, remap: 'legacy-only', ...baseInput });
    expect(labels((await createReader(legacyOnly).collectCompatibilities([100])).get(100)!))
      .toEqual(['modern:146', 'legacy:146']);
  });

  it('A3: the pre-fix write path makes the A1 assertions fail (no always-green assertion)', async () => {
    const legacyOnly = collisionFixture();
    await runMerge({ store: legacyOnly, remap: 'legacy-only', ...baseInput });

    // Exactly the A1 assertion set, on the pre-fix path: it must reject.
    await expect(assertCollisionRemapped(legacyOnly)).rejects.toThrow();
    expect(twinSymmetryViolations(legacyOnly).length).toBeGreaterThan(0);

    // The concrete symptoms, spelled out.
    const reader = createReader(legacyOnly);
    expect(labels((await reader.collectCompatibilities([100])).get(100)!))
      .toEqual(['modern:146', 'legacy:147']);                                                  // foreign declaration on the target version
    expect(labels((await reader.collectDependencies([100])).get(100)!))
      .toEqual(['modern#6']);                                                                  // source-side dependency silently lost
    expect(rowsOnMergedSource(legacyOnly).length).toBeGreaterThan(0);                          // twins stranded on the merged-away version

    // And the fixed path clears each of those on the same fixture.
    const fixed = collisionFixture();
    await runMerge({ store: fixed, remap: 'symmetric', ...baseInput });
    expect(rowsOnMergedSource(fixed)).toEqual([]);
  });

  it('\u2463: no evidence row is left on a version owned by the merged-away resource', async () => {
    const store = collisionFixture();
    await runMerge({ store, remap: 'symmetric', ...baseInput });
    expect(rowsOnMergedSource(store)).toEqual([]);
  });

  /**
   * ④ regression (Issue #65): after the merge, the target resource must match a
   * `game_version=147` filter — the constraint only the merged-away source
   * declared. Issue #65 ⑥ rules that ④ stays a regression case under fix A
   * (the twins land on the target version, so the resource-scoped `EXISTS`
   * matches); it turns into a code change only if the search guards are ever
   * version-scoped (the B档 path).
   *
   * `resourceMatchesGameVersion` reproduces the two `EXISTS` branches of
   * `mdtbbs-search.providers.ts:75-97` (`game_version` filter): the modern branch
   * scopes by the owning version's `resource_id`; the legacy branch is guarded by
   * the same-resource `EXISTS`, not by version. The test asserts those two
   * anchors against the provider source, so this reproduction fails loudly when
   * the guards change instead of drifting silently.
   */
  function resourceMatchesGameVersion(store: Record<string, Row[]>, resourceId: number, gameVersion: string) {
    const versions = store.resource_versions.filter((row) => Number(row.resource_id) === resourceId && row.status === 'published');
    const within = (min: string | null, max: string | null) =>
      (min == null || min <= gameVersion) && (max == null || max >= gameVersion);
    const modern = (store.resource_compatibilities || []).some((row) => versions.some((version) => Number(version.id) === Number(row.resource_version_id))
      && row.runtime === 'mindustry'
      && (row.game_version === gameVersion || within(row.min_game_version ?? null, row.max_game_version ?? null)));

    if (modern) return true;
    const copiedLegacyIds = new Set((store.resource_compatibilities || []).map((row) => row.legacy_source_id).filter(Boolean));
    return (store.resource_version_compatibilities || []).some((row) => versions.some((version) => Number(version.id) === Number(row.resource_version_id))
      && !copiedLegacyIds.has(row.id)
      && row.runtime === 'mindustry'
      && (row.game_series === gameVersion || within(row.min_version_value ?? null, row.max_version_value ?? null)));
  }

  it('\u2463: the merged target resource matches a game_version filter for the source-only constraint', async () => {
    // The reproduction must stay aligned with the provider's actual guards.
    const providerSource = require('fs').readFileSync(
      require('path').join(__dirname, '../mdtbbs-domain/mdtbbs-search.providers.ts'), 'utf8');
    expect(providerSource).toContain('search_compatibility_version.resource_id = r.id');
    expect(providerSource).toContain('search_compatibility_copied.legacy_source_id = search_compatibility.id');
    // The legacy guard is resource-scoped today, never version-scoped (Issue #65 \u2463).
    expect(providerSource).not.toContain('search_compatibility_copied.resource_version_id');

    const store = collisionFixture();
    await runMerge({ store, remap: 'symmetric', ...baseInput });

    expect(resourceMatchesGameVersion(store, 7, '147')).toBe(true);
    expect(resourceMatchesGameVersion(store, 7, '146')).toBe(true);

    // Pre-fix path: the twin staying on the merged-away version makes 147 unreachable.
    const legacyOnly = collisionFixture();
    await runMerge({ store: legacyOnly, remap: 'legacy-only', ...baseInput });
    expect(resourceMatchesGameVersion(legacyOnly, 7, '147')).toBe(false);
    expect(resourceMatchesGameVersion(legacyOnly, 7, '146')).toBe(true);
  });

  it('keeps the collision mapping in the merge log for the affected version pair', async () => {
    const store = collisionFixture();
    const { result, mergeLogs } = await runMerge({ store, remap: 'symmetric', ...baseInput });
    expect(result.version_collision_mappings).toEqual([
      { source_version_id: 200, target_version_id: 100, attachments_migrated: true },
    ]);
    expect(mergeLogs[0].migrated_counts.version_collision_mappings).toHaveLength(1);
  });

  it('moves a non-colliding version row to the target instead of remapping evidence', async () => {
    const store = makeStore({
      ...clone(baseInput),
      versions: [...clone(baseInput.versions), { id: 201, resource_id: 8, version: '2.0', status: 'published', release_channel: 'release' }],
    });
    await runMerge({ store, remap: 'symmetric', ...baseInput });
    // The colliding pair keeps its rows; only the non-colliding version moves resource.
    expect(store.resource_versions.map((row) => [row.id, row.resource_id])).toEqual([[200, 8], [100, 7], [201, 7]]);
  });
});

/**
 * Issue #70: Map/Schematic version-level Mod dependency filtering.
 *
 * The rule itself (selector, visibility predicate, token resolution) is pinned
 * in `resource-mod-dependency-filter.spec.ts`; these cases pin the list query's
 * behaviour: what reaches `andWhere`, under which `resource_kind`, and what a
 * request that cannot be answered does.
 */
describe('ResourcesService Mod dependency filter', () => {
  const MOD_QUERY = 'resourceRequiredMod0';
  const EXCLUDED_QUERY = 'resourceExcludedMod0';

  /**
   * A service whose data source answers the three reads the filter performs:
   * table availability, the canonical/alias resolver, and filter options. The
   * resolver rows are keyed by the identifiers the request used, mimicking
   * `mod_profiles`/`mod_id_aliases` joined on a publicly visible resource.
   */
  function createModFilterService(options: {
    tables?: string[];
    resolves?: Array<{ mod_id: string; requested_identifier: string }>;
    optionRows?: Array<{ mod_id: string }>;
  } = {}) {
    const tables = options.tables ?? ['resource_dependencies', 'resource_version_dependencies'];
    const resolves = options.resolves ?? [];
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('information_schema.tables')) return tables.map((table_name) => ({ table_name }));
      // The options query also joins `mod_profiles`, so it must be matched first.
      if (sql.includes('SELECT DISTINCT profile.mod_id')) return options.optionRows ?? [];
      if (sql.includes('mod_profiles profile')) return resolves;
      return [];
    });
    return createService({ dataSource: { query } });
  }

  const clauseFor = (qb: { andWhere: jest.Mock }, marker: string) => {
    const call = qb.andWhere.mock.calls.find(([clause]) => String(clause).includes(marker));
    return call ? { clause: String(call[0]), parameters: call[1] as Record<string, string> } : null;
  };

  it('requires every requested Mod on the selected published version, resolving aliases to canonical IDs', async () => {
    const { service, defaultQb } = createModFilterService({
      resolves: [
        { mod_id: 'alpha.mod', requested_identifier: 'alpha.mod' },
        { mod_id: 'beta.mod', requested_identifier: 'beta-alias' },
      ],
    });

    await service.getList({ limit: 20, resource_kind: 'map', required_mods: 'alpha.mod, beta-alias' } as any, { scope: 'public' });

    // One condition, both proofs, ANDed: an alias resolves to its canonical ID
    // and the second value is a separate conjunct, never an alternative.
    const condition = clauseFor(defaultQb, MOD_QUERY)!;
    expect(condition.clause).toContain(`profile.mod_id = :${MOD_QUERY}`);
    expect(condition.clause).toContain('profile.mod_id = :resourceRequiredMod1');
    expect(condition.clause).toContain(' AND ');
    expect(condition.parameters).toEqual({ [MOD_QUERY]: 'alpha.mod', resourceRequiredMod1: 'beta.mod' });
    // The proof targets the D-A selector, both dependency tables, and the public
    // visibility predicate of the selected version's dependency target.
    expect(condition.clause).toContain('resource_versions sv WHERE sv.resource_id = resource.id');
    expect(condition.clause).toContain("sv.status = 'published'");
    expect(condition.clause).toContain('sv.public_id IS NOT NULL');
    expect(condition.clause).toContain('ORDER BY sv.recommended DESC, COALESCE(sv.published_at, sv.created_at) DESC, sv.revision DESC, sv.id DESC LIMIT 1');
    expect(condition.clause).toContain('resource_dependencies d');
    expect(condition.clause).toContain('resource_version_dependencies d');
    expect(condition.clause).toContain('legacy_source_id');
    expect(condition.clause).toContain('target.merged_into_resource_id IS NULL');
    expect(condition.clause).toContain("target.visibility <> 'private'");
    expect(condition.clause).toContain('mod_profiles profile');
    // Never resolved through the raw identifier: an unresolved row is not proof.
    expect(condition.clause).not.toContain('external_identifier');
  });

  it('excludes a Mod only when the version proves it absent and has no unprovable dependency row', async () => {
    const { service, defaultQb } = createModFilterService({
      resolves: [{ mod_id: 'rival.mod', requested_identifier: 'rival.mod' }],
    });

    await service.getList({ limit: 20, resource_kind: 'schematic', excluded_mods: 'rival.mod' } as any, { scope: 'public' });

    const condition = clauseFor(defaultQb, EXCLUDED_QUERY)!;
    expect(condition.clause).toContain('NOT (EXISTS');
    expect(condition.parameters).toEqual({ [EXCLUDED_QUERY]: 'rival.mod' });
    // Two facts, both required: the Mod is proven absent, and the version has no
    // unprovable required row that could be the very dependency in question.
    expect(condition.clause).toContain(`NOT (EXISTS`);
    expect(condition.clause).toContain("d.dependency_type = 'required'");
    // The unproven-row guard is an additional conjunct whose inner proof is a
    // negation: `NOT EXISTS (... WHERE target/profile visible)`.
    expect(condition.clause).toContain('NOT EXISTS (SELECT 1 FROM resources target');
    // One unproven-row guard per dependency table, plus the exclusion itself.
    expect(condition.clause.split('NOT EXISTS (SELECT 1 FROM resources target').length - 1).toBe(2);
  });

  it('turns an unresolvable non-empty token into an empty result, not a dropped condition', async () => {
    const { service, defaultQb } = createModFilterService({ resolves: [{ mod_id: 'alpha.mod', requested_identifier: 'alpha.mod' }] });

    await service.getList({ limit: 20, resource_kind: 'map', required_mods: 'alpha.mod,ghost.mod' } as any, { scope: 'public' });

    expect(defaultQb.andWhere).toHaveBeenCalledWith('1 = 0', {});
    expect(clauseFor(defaultQb, MOD_QUERY)).toBeNull();
  });

  it('empty and whitespace-only values are not conditions', async () => {
    const { service, defaultQb } = createModFilterService();
    const baseline = createModFilterService();
    await service.getList({ limit: 20, resource_kind: 'map', required_mods: ' , ', excluded_mods: '' } as any, { scope: 'public' });
    await baseline.service.getList({ limit: 20, resource_kind: 'map' } as any, { scope: 'public' });
    // SQL identical to the same request without the parameter, literally.
    const clauses = (qb: { andWhere: jest.Mock }) => qb.andWhere.mock.calls.map(([clause, params]) => [String(clause), params]);
    expect(clauses(defaultQb)).toEqual(clauses(baseline.defaultQb));
  });

  it('ignores the condition for a kind without version-level dependency evidence', async () => {
    const { service, defaultQb } = createModFilterService({ resolves: [{ mod_id: 'alpha.mod', requested_identifier: 'alpha.mod' }] });
    const baseline = createModFilterService({ resolves: [{ mod_id: 'alpha.mod', requested_identifier: 'alpha.mod' }] });

    await service.getList({ limit: 20, resource_kind: 'mod', required_mods: 'alpha.mod' } as any, { scope: 'public' });
    await baseline.service.getList({ limit: 20, resource_kind: 'mod' } as any, { scope: 'public' });

    const clauses = (qb: { andWhere: jest.Mock }) => qb.andWhere.mock.calls.map(([clause, params]) => [String(clause), params]);
    expect(clauses(defaultQb)).toEqual(clauses(baseline.defaultQb));
    expect(defaultQb.andWhere).not.toHaveBeenCalledWith('1 = 0');
  });

  it('fails closed when no dependency table can be read', async () => {
    const { service, defaultQb } = createModFilterService({ tables: [], resolves: [{ mod_id: 'alpha.mod', requested_identifier: 'alpha.mod' }] });
    await service.getList({ limit: 20, resource_kind: 'map', required_mods: 'alpha.mod' } as any, { scope: 'public' });
    expect(defaultQb.andWhere).toHaveBeenCalledWith('1 = 0', {});
  });

  it('binds every placeholder the generated condition uses', async () => {
    const { service, defaultQb } = createModFilterService({
      resolves: [
        { mod_id: 'alpha.mod', requested_identifier: 'alpha.mod' },
        { mod_id: 'rival.mod', requested_identifier: 'rival.mod' },
      ],
    });

    await service.getList({ limit: 20, resource_kind: 'map', required_mods: 'alpha.mod', excluded_mods: 'rival.mod' } as any, { scope: 'public' });

    const [clause, parameters] = defaultQb.andWhere.mock.calls.find(([value]) => String(value).includes(MOD_QUERY))! as [string, Record<string, string>];
    const placeholders = [...new Set([...clause.matchAll(/:(\w+)/g)].map((match) => match[1]))].sort();
    expect(placeholders).toEqual(Object.keys(parameters).sort());
    expect(parameters[MOD_QUERY]).toBe('alpha.mod');
    expect(parameters[EXCLUDED_QUERY]).toBe('rival.mod');
  });

  /**
   * Issue #70, admin scope: `GET /api/resources/admin` and the external
   * `resources:moderate` list both funnel through this call with
   * `scope: 'admin'`. That path never selects a published version, so it has no
   * version to prove a dependency against — answering without the condition
   * would return precisely the widened set the caller asked to narrow.
   */
  it('refuses the Mod conditions for the admin scope instead of silently dropping them', async () => {
    const { service, resourceRepository } = createModFilterService();

    await expect(service.getList(
      { limit: 20, resource_kind: 'map', required_mods: 'alpha.mod' } as any,
      { scope: 'admin' },
    )).rejects.toThrow(BadRequestException);
    // Refused, not answered: the widened admin query is never issued.
    expect(resourceRepository.find).not.toHaveBeenCalled();

    await expect(service.getList(
      { limit: 20, excluded_mods: 'rival.mod' } as any,
      { scope: 'admin' },
    )).rejects.toThrow(BadRequestException);
    expect(resourceRepository.find).not.toHaveBeenCalled();
  });

  it('keeps every other admin-scope condition untouched by that refusal', async () => {
    const { service, resourceRepository, defaultQb } = createModFilterService();
    // Same request minus the two Mod keys: the documented admin behaviour, and
    // an empty (whitespace-only) Mod value is not a condition anywhere.
    await service.getList({ limit: 20, status: 'pending', required_mods: ' , ' } as any, { scope: 'admin' });

    expect(resourceRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(resourceRepository.find).toHaveBeenCalled();
    expect(defaultQb.andWhere).not.toHaveBeenCalledWith('1 = 0', {});
  });

  it('still answers the Mod conditions on the public scope', async () => {
    const { service, resourceRepository } = createModFilterService({
      resolves: [{ mod_id: 'alpha.mod', requested_identifier: 'alpha.mod' }],
    });
    await service.getList({ limit: 20, resource_kind: 'map', required_mods: 'alpha.mod' } as any, { scope: 'public' });
    // The refusal is scoped to admin; the public path keeps filtering.
    expect(resourceRepository.find).not.toHaveBeenCalled();
  });

  it('offers only publicly resolvable Mod options, never an unresolved token', async () => {
    const { service, dataSource } = createModFilterService({
      optionRows: [{ mod_id: 'alpha.mod' }, { mod_id: 'beta.mod' }],
    });

    const options = await service.getFilterOptions();

    expect(options.required_mods).toEqual(['alpha.mod', 'beta.mod']);
    const optionSql = dataSource.query.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes('SELECT DISTINCT profile.mod_id'));
    expect(optionSql).toBeDefined();
    // Options come from the same selector and visibility predicate as the list:
    // a pending version's dependency (or a hidden target) can never surface.
    expect(optionSql).toContain("sv.status = 'published'");
    expect(optionSql).toContain('sv.public_id IS NOT NULL');
    expect(optionSql).toContain("d.dependency_type = 'required'");
    expect(optionSql).toContain('target.is_public = 1');
    expect(optionSql).toContain('target.merged_into_resource_id IS NULL');
    expect(optionSql).not.toContain('external_identifier');
  });
});
