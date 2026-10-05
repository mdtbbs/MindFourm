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
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
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
  Like: jest.fn((v) => ({ _like: v })),
  LessThan: jest.fn((v) => ({ _lt: v })),
  In: jest.fn((v) => ({ _in: v })),
}));

jest.mock('@entities/resource.entity', () => ({
  Resource: class Resource {},
}));

jest.mock('@entities/resource-category.entity', () => ({
  ResourceCategory: class ResourceCategory {},
}));

jest.mock('@entities/resource-version.entity', () => ({
  ResourceVersion: class ResourceVersion {},
}));

jest.mock('@entities/resource-rating.entity', () => ({
  ResourceRating: class ResourceRating {},
}));

jest.mock('@entities/user.entity', () => ({
  User: class User {},
}));

jest.mock('@common/utils/markdown.util', () => ({
  parseMarkdown: jest.fn((v) => v),
}));

jest.mock('@common/utils/cursor.util', () => ({
  encodeCursor: jest.fn((...args) => args.join(':')),
  decodeCursor: jest.fn((v) => v.split(':')),
}));

jest.mock('@common/utils/search.util', () => ({
  escapeLike: jest.fn((v) => v),
}));

jest.mock('@common/utils/constants', () => ({
  RESOURCE_STATUS: {
    pending: 'pending',
    approved: 'approved',
    published: 'published',
    rejected: 'rejected',
  },
  PUBLIC_RESOURCE_STATUSES: ['approved', 'published'],
}));

jest.mock('@common/utils/safe-url.util', () => ({
  isSafeExternalUrl: jest.fn(() => true),
}));

jest.mock('@modules/resources/resource-rating.util', () => ({
  validateResourceSort: jest.fn((v?: string) => v || 'created_at'),
  isValidRating: jest.fn(() => true),
  ratingAggregateDelta: jest.fn(() => ({ countDelta: 0, sumDelta: 0 })),
  RESOURCE_SORT_ALLOWLIST: ['created_at', 'updated_at', 'download_count', 'rating_average', 'rating_count'],
}));

jest.mock('@modules/admin-notifications/admin-notifications.service', () => ({
  AdminNotificationsService: class AdminNotificationsService {
    publishModerationPending = jest.fn();
    publishModerationResult = jest.fn();
  },
}));

jest.mock('@modules/notifications/notifications.service', () => ({
  NotificationsService: class NotificationsService {
    create = jest.fn();
  },
}));

jest.mock('@modules/resources/mfl-client.service', () => ({
  MflClientService: class MflClientService {
    uploadFile = jest.fn();
    getDownloadUrl = jest.fn();
    blockDownloads = jest.fn();
    updateApprovalStatus = jest.fn();
  },
}));

jest.mock('@modules/resources/resource-categories.service', () => ({
  ResourceCategoryService: class ResourceCategoryService {
    getById = jest.fn();
  },
}));

jest.mock('@modules/content-safety/content-safety.service', () => ({
  ContentSafetyService: class ContentSafetyService {
    assess = jest.fn();
    recordFlag = jest.fn();
  },
}));

jest.mock('@modules/resources/resource-subscriptions.service', () => ({
  ResourceSubscriptionsService: class ResourceSubscriptionsService {
    notifyResourceUpdate = jest.fn();
  },
}));

import { ResourcesService } from '@modules/resources/resources.service';
import { ResourceCategoryService } from '@modules/resources/resource-categories.service';

function createService(overrides: {
  resourceRepository?: Record<string, jest.Mock>;
  categoryService?: Partial<Record<keyof ResourceCategoryService, jest.Mock>>;
  contentSafety?: { assess: jest.Mock; recordFlag: jest.Mock };
  transactionManager?: Record<string, any>;
  dataSource?: Record<string, jest.Mock>;
} = {}) {
  const defaultQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    maxExecutionTime: jest.fn().mockReturnThis(),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  const resourceRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((v: unknown) => v),
    save: jest.fn().mockImplementation(async (v: unknown) => v),
    update: jest.fn(),
    softDelete: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    increment: jest.fn(),
    createQueryBuilder: jest.fn(() => defaultQb),
    ...overrides.resourceRepository,
  };

  const categoryService = {
    getById: jest.fn().mockResolvedValue(null),
    ...overrides.categoryService,
  };
  const transactionManager = {
    create: jest.fn().mockImplementation((_entity: unknown, value: unknown) => value),
    save: jest.fn().mockImplementation(async (_entity: unknown, value: unknown) => {
      if (Array.isArray(value)) return value;
      return { id: 1, ...(value as Record<string, unknown>) };
    }),
    ...overrides.transactionManager,
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn().mockImplementation(async (callback: (manager: typeof transactionManager) => unknown) =>
      callback(transactionManager)),
    ...overrides.dataSource,
  };
  const contentSafety = overrides.contentSafety;

  return {
    service: new ResourcesService(
      resourceRepository as any,
      {} as any, // userRepository
      {} as any, // categoryRepository
      {
        find: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(undefined),
      } as any, // versionRepository
      { update: jest.fn().mockResolvedValue(undefined) } as any, // resourceFileRepository
      {} as any, // ratingRepository
      dataSource as any,
      { publishModerationPending: jest.fn().mockResolvedValue(undefined), publishModerationResult: jest.fn().mockResolvedValue(undefined) } as any,
      { create: jest.fn() } as any,
      { uploadFile: jest.fn(), getDownloadUrl: jest.fn(), blockDownloads: jest.fn(), updateApprovalStatus: jest.fn() } as any,
      categoryService as any,
      undefined,
      contentSafety as any,
    ),
    resourceRepository,
    categoryService,
    contentSafety,
    defaultQb,
  };
}

describe('ResourcesService - admin merge', () => {
  it('moves published collision attachments to the canonical version, preserves interactions, and records the merge', async () => {
    const source = {
      id: 11, status: 'published', is_public: 1, title: 'Source', metadata_json: { tags: ['source'] },
      rating_count: 1, rating_sum: 4, download_count: 10, view_count: 20,
      merged_into_resource_id: null, discussion_thread_id: 301, file_path: null, content_hash: null, mfl_file_id: null, external_url: null,
    };
    const target = {
      id: 12, status: 'published', is_public: 1, title: 'Canonical', metadata_json: { tags: ['target'] },
      rating_count: 1, rating_sum: 5, download_count: 3, view_count: 7,
      merged_into_resource_id: null, discussion_thread_id: 302, file_path: null, content_hash: null, mfl_file_id: null, external_url: null,
    };
    const tables = [
      'resource_comments', 'resource_comment_reply_map', 'replies', 'posts', 'resource_favorites', 'resource_likes', 'resource_ratings', 'resource_subscriptions',
      'resource_attributions', 'resource_versions', 'resource_files', 'download_events', 'resource_version_dependencies',
      'resource_version_compatibilities', 'content_relations', 'knowledge_articles', 'game_content_upload_sessions',
      'resource_media_links', 'resource_content_hash_claims', 'resource_structure_hash_claims', 'resources',
    ].map((table_name) => ({ table_name }));
    const versionSelects: number[] = [];
    const manager = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        if (sql.includes('SELECT * FROM resources WHERE id IN')) return [source, target];
        if (sql.includes('information_schema.tables')) return tables;
        if (sql.includes("file.storage_backend='res'")) return [];
        if (sql.includes('SELECT id, post_type, source FROM posts WHERE id = ?')) return [{ id: params[0], post_type: 'resource_discussion', source: 'SYSTEM' }];
        if (sql.includes('SELECT id, version, status FROM resource_versions WHERE resource_id = ? ORDER BY id')) {
          versionSelects.push(Number(params[0]));
          return [{ id: 101, version: '1.0.0', status: 'published' }, { id: 102, version: '2.0.0', status: 'published' }];
        }
        if (sql.includes('SELECT id, version, status FROM resource_versions WHERE resource_id = ?')) {
          versionSelects.push(Number(params[0]));
          return [{ id: 201, version: '1.0.0', status: 'published' }];
        }
        if (sql.includes('SELECT COUNT(*)') && sql.includes('COALESCE(SUM(rating)')) return [{ count: 2, total: 9 }];
        if (sql.includes('SELECT COUNT(*)')) return [{ count: 1 }];
        return { affectedRows: 1 };
      }),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(), execute: jest.fn().mockResolvedValue({ affected: 1 }),
      })),
    };
    const { service } = createService({
      transactionManager: manager,
      dataSource: { transaction: jest.fn((callback: (manager: any) => unknown) => callback(manager)) },
    });

    const result = await service.mergeResource(11, 12, 99);

    expect(versionSelects).toEqual([11, 12]);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE replies SET post_id = ? WHERE post_id = ?'), [302, 301]);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE resource_comment_reply_map SET resource_id = ?'), [12, 11]);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE posts SET deleted_at = NOW()'), [301]);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE resources SET discussion_thread_id = NULL WHERE id = ?'), [11]);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE resource_files'), [201, 101]);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE download_events SET version_id = ?'), [201, 101]);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("status = 'merged'"), [12, 11]);
    expect(result).toMatchObject({ source_id: 11, target_id: 12, status: 'merged', migrated_counts: { version_collisions: 1 } });
    expect(result.version_collision_mappings).toEqual([{ source_version_id: 101, target_version_id: 201, attachments_migrated: true }]);
    const log = manager.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO resource_merge_logs'));
    expect(JSON.parse(log[1][3])).toMatchObject({
      preview_counts: expect.any(Object),
      version_collision_mappings: [{ source_version_id: 101, target_version_id: 201, attachments_migrated: true }],
    });
  });
});

describe('ResourcesService - Public Visibility', () => {
  it('records high-risk resource submissions for moderation audit', async () => {
    const risk = { score: 3, rules: ['keyword:木马'], mustReview: true };
    const contentSafety = {
      assess: jest.fn().mockResolvedValue(risk),
      recordFlag: jest.fn().mockResolvedValue(undefined),
    };
    const saved = {
      id: 19,
      user_id: 7,
      title: '工具下载',
      description: '包含木马的描述',
      resource_type: 'external',
      external_url: 'https://example.com/tool',
      version: '1.0.0',
      status: 'pending',
      is_public: 1,
      use_mfl: 0,
      user: { username: 'author' },
      category: null,
    };
    const { service, resourceRepository } = createService({
      contentSafety,
      resourceRepository: {
        save: jest.fn().mockResolvedValue(saved),
        findOne: jest.fn().mockResolvedValue(saved),
      },
    });

    const result = await service.create({
      title: '工具下载',
      description: '包含木马的描述',
      resource_type: 'external',
      external_url: 'https://example.com/tool',
      version: '1.0.0',
    } as any, 7, undefined, { ipAddress: '203.0.113.7' });

    expect(result.status).toBe('pending');
    expect(contentSafety.assess).toHaveBeenCalledWith(expect.stringContaining('木马'), { actorId: 7, surface: 'resource' });
    expect(contentSafety.recordFlag).toHaveBeenCalledWith({
      userId: 7,
      targetType: 'resource',
      targetId: 19,
      risk,
      ipAddress: '203.0.113.7',
    });
    expect(resourceRepository.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });

  describe('isResourcePubliclyAccessible', () => {
    it('should return true for approved resource in active category', async () => {
      const { service, categoryService } = createService({
        categoryService: {
          getById: jest.fn().mockResolvedValue({ id: 1, is_active: 1 }),
        },
      });

      const resource = {
        id: 1,
        status: 'approved',
        is_public: 1,
        category_id: 1,
      };

      const result = await service.isResourcePubliclyAccessible(resource);
      expect(result).toBe(true);
      expect(categoryService.getById).toHaveBeenCalledWith(1);
    });

    it('should return true for published resource in active category', async () => {
      const { service } = createService({
        categoryService: {
          getById: jest.fn().mockResolvedValue({ id: 1, is_active: 1 }),
        },
      });

      const resource = {
        id: 1,
        status: 'published',
        is_public: 1,
        category_id: 1,
      };

      const result = await service.isResourcePubliclyAccessible(resource);
      expect(result).toBe(true);
    });

    it('should return false for resource in disabled category', async () => {
      const { service } = createService({
        categoryService: {
          getById: jest.fn().mockResolvedValue({ id: 1, is_active: 0 }),
        },
      });

      const resource = {
        id: 1,
        status: 'approved',
        is_public: 1,
        category_id: 1,
      };

      const result = await service.isResourcePubliclyAccessible(resource);
      expect(result).toBe(false);
    });

    it('should return false for non-public resource', async () => {
      const { service } = createService({
        categoryService: {
          getById: jest.fn().mockResolvedValue({ id: 1, is_active: 1 }),
        },
      });

      const resource = {
        id: 1,
        status: 'approved',
        is_public: 0,
        category_id: 1,
      };

      const result = await service.isResourcePubliclyAccessible(resource);
      expect(result).toBe(false);
    });

    it('should return false for pending resource', async () => {
      const { service } = createService({
        categoryService: {
          getById: jest.fn().mockResolvedValue({ id: 1, is_active: 1 }),
        },
      });

      const resource = {
        id: 1,
        status: 'pending',
        is_public: 1,
        category_id: 1,
      };

      const result = await service.isResourcePubliclyAccessible(resource);
      expect(result).toBe(false);
    });

    it('should return false for rejected resource', async () => {
      const { service } = createService({
        categoryService: {
          getById: jest.fn().mockResolvedValue({ id: 1, is_active: 1 }),
        },
      });

      const resource = {
        id: 1,
        status: 'rejected',
        is_public: 1,
        category_id: 1,
      };

      const result = await service.isResourcePubliclyAccessible(resource);
      expect(result).toBe(false);
    });

    it('should return false when category is missing (deleted)', async () => {
      const { NotFoundException } = require('@nestjs/common');
      const { service } = createService({
        categoryService: {
          getById: jest.fn().mockRejectedValue(new NotFoundException('分类不存在')),
        },
      });

      const resource = {
        id: 1,
        status: 'approved',
        is_public: 1,
        category_id: 999,
      };

      const result = await service.isResourcePubliclyAccessible(resource);
      expect(result).toBe(false);
    });

    it('should rethrow non-NotFoundException errors from category lookup', async () => {
      const { service } = createService({
        categoryService: {
          getById: jest.fn().mockRejectedValue(new Error('数据库连接失败')),
        },
      });

      const resource = {
        id: 1,
        status: 'approved',
        is_public: 1,
        category_id: 999,
      };

      await expect(service.isResourcePubliclyAccessible(resource)).rejects.toThrow('数据库连接失败');
    });

    it('should return true for resource without a category', async () => {
      const { service, categoryService } = createService();

      const resource = {
        id: 1,
        status: 'approved',
        is_public: 1,
        category_id: null,
      };

      const result = await service.isResourcePubliclyAccessible(resource);
      expect(result).toBe(true);
      expect(categoryService.getById).not.toHaveBeenCalled();
    });
  });

  describe('getPublicResources', () => {
    it('should join category and filter by active category', async () => {
      const { service, resourceRepository, defaultQb } = createService();
      defaultQb.getMany.mockResolvedValue([]);

      await service.getPublicResources();

      expect(resourceRepository.createQueryBuilder).toHaveBeenCalledWith('resource');
      expect(defaultQb.leftJoin).toHaveBeenCalledWith('resource.category', 'category');
      expect(defaultQb.andWhere).toHaveBeenCalledWith(
        'resource.is_public = :isPublic',
        { isPublic: 1 },
      );
      expect(defaultQb.andWhere).toHaveBeenCalledWith(
        '(category.id IS NULL OR category.is_active = :categoryActive)',
        { categoryActive: 1 },
      );
    });

    it('should filter by public statuses', async () => {
      const { service, defaultQb } = createService();
      defaultQb.getMany.mockResolvedValue([]);

      await service.getPublicResources();

      expect(defaultQb.where).toHaveBeenCalledWith(
        'resource.status IN (:...statuses)',
        { statuses: ['approved', 'published'] },
      );
    });

    it('should order by created_at DESC', async () => {
      const { service, defaultQb } = createService();
      defaultQb.getMany.mockResolvedValue([]);

      await service.getPublicResources();

      expect(defaultQb.orderBy).toHaveBeenCalledWith('resource.created_at', 'DESC');
    });
  });

  describe('getPublicResourceById', () => {
    it('should return normalized resource when publicly accessible', async () => {
      const { service, resourceRepository } = createService({
        resourceRepository: {
          findOne: jest.fn().mockResolvedValue({
            id: 1,
            title: 'Test',
            status: 'approved',
            is_public: 1,
            category_id: 1,
            category: { id: 1, is_active: 1, name: 'Cat', icon: 'X' },
            user: { username: 'u', avatar_url: null },
          }),
        },
        categoryService: {
          getById: jest.fn().mockResolvedValue({ id: 1, is_active: 1 }),
        },
      });

      const result = await service.getPublicResourceById(1);
      expect(result).not.toBeNull();
      expect(result.id).toBe(1);
    });

    it('should return null when resource does not exist', async () => {
      const { service } = createService({
        resourceRepository: {
          findOne: jest.fn().mockResolvedValue(null),
        },
      });

      const result = await service.getPublicResourceById(999);
      expect(result).toBeNull();
    });

    it('should return null when resource is not publicly accessible', async () => {
      const { service } = createService({
        resourceRepository: {
          findOne: jest.fn().mockResolvedValue({
            id: 1,
            status: 'pending',
            is_public: 1,
            category_id: 1,
          }),
        },
        categoryService: {
          getById: jest.fn().mockResolvedValue({ id: 1, is_active: 1 }),
        },
      });

      const result = await service.getPublicResourceById(1);
      expect(result).toBeNull();
    });

    it('should return null when category is inactive', async () => {
      const { service } = createService({
        resourceRepository: {
          findOne: jest.fn().mockResolvedValue({
            id: 1,
            status: 'approved',
            is_public: 1,
            category_id: 1,
          }),
        },
        categoryService: {
          getById: jest.fn().mockResolvedValue({ id: 1, is_active: 0 }),
        },
      });

      const result = await service.getPublicResourceById(1);
      expect(result).toBeNull();
    });
  });

  describe('getList – public scope filters disabled categories', () => {
    const baseQuery = { limit: 20 } as any;

    it('uses createQueryBuilder with LEFT JOIN and category filter for public scope', async () => {
      const { service, resourceRepository, defaultQb } = createService();
      defaultQb.getMany.mockResolvedValue([]);

      await service.getList(baseQuery, { scope: 'public' });

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
      expect(defaultQb.andWhere).toHaveBeenCalledWith(
        '(category.id IS NULL OR category.is_active = :categoryActive)',
        { categoryActive: 1 },
      );
    });

    it('does NOT call createQueryBuilder for admin scope (uses find instead)', async () => {
      const { service, resourceRepository, defaultQb } = createService();

      await service.getList(baseQuery, { scope: 'admin' });

      expect(resourceRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(resourceRepository.find).toHaveBeenCalled();
      // The category-active filter should NOT appear for admin scope
      expect(defaultQb.andWhere).not.toHaveBeenCalledWith(
        '(category.id IS NULL OR category.is_active = :categoryActive)',
        expect.anything(),
      );
    });

    it('includes category_id filter in the query builder when provided', async () => {
      const { service, defaultQb } = createService();
      defaultQb.getMany.mockResolvedValue([]);

      await service.getList({ ...baseQuery, category_id: 5 } as any, { scope: 'public' });

      expect(defaultQb.andWhere).toHaveBeenCalledWith(
        'resource.category_id = :categoryId',
        { categoryId: 5 },
      );
    });

    it('includes search filter in the query builder when provided', async () => {
      const { service, defaultQb } = createService();
      defaultQb.getMany.mockResolvedValue([]);

      await service.getList({ ...baseQuery, search: 'plugin' } as any, { scope: 'public' });

      expect(defaultQb.andWhere).toHaveBeenCalledWith(
        'resource.title LIKE :search',
        { search: '%plugin%' },
      );
    });

    it('returns normalized resources from query builder results', async () => {
      const fakeResources = [
        {
          id: 1, title: 'Test', status: 'approved', is_public: 1,
          category: { id: 1, name: '插件', icon: 'X', is_active: 1 },
          user: { username: 'u', avatar_url: null },
          created_at: new Date('2026-01-01'),
        },
      ];
      const { service, defaultQb } = createService();
      defaultQb.getRawAndEntities.mockResolvedValue({ entities: fakeResources, raw: fakeResources.map(r => ({ resource_id: r.id, resource_card_description: 'Summary' })) });

      const result = await service.getList(baseQuery, { scope: 'public' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(1);
      expect(result.has_more).toBe(false);
      expect(result.next_cursor).toBeNull();
    });
  });

  describe('getPublicByUserId – filters disabled categories', () => {
    it('uses createQueryBuilder with LEFT JOIN and category filter', async () => {
      const { service, resourceRepository, defaultQb } = createService();
      defaultQb.getMany.mockResolvedValue([]);

      await service.getPublicByUserId(42);

      expect(resourceRepository.createQueryBuilder).toHaveBeenCalledWith('resource');
      expect(defaultQb.leftJoin).toHaveBeenCalledWith('resource.category', 'category');
      expect(defaultQb.where).toHaveBeenCalledWith(
        'resource.user_id = :userId',
        { userId: 42 },
      );
      expect(defaultQb.andWhere).toHaveBeenCalledWith(
        'resource.status IN (:...statuses)',
        { statuses: ['approved', 'published'] },
      );
      expect(defaultQb.andWhere).toHaveBeenCalledWith(
        'resource.is_public = :isPublic',
        { isPublic: 1 },
      );
      expect(defaultQb.andWhere).toHaveBeenCalledWith(
        '(category.id IS NULL OR category.is_active = :categoryActive)',
        { categoryActive: 1 },
      );
    });

    it('orders by created_at DESC and applies cursor pagination', async () => {
      const { service, defaultQb } = createService();
      defaultQb.getMany.mockResolvedValue([]);

      await service.getPublicByUserId(42);

      expect(defaultQb.orderBy).toHaveBeenCalledWith('resource.created_at', 'DESC');
      expect(defaultQb.addOrderBy).toHaveBeenCalledWith('resource.id', 'DESC');
    });

    it('returns offset pagination for profile page requests', async () => {
      const { service, defaultQb } = createService();
      defaultQb.getManyAndCount.mockResolvedValue([[{
        id: 2,
        title: 'LanLink',
        status: 'published',
        is_public: 1,
        created_at: new Date('2026-08-01'),
      }], 21]);

      const result = await service.getPublicByUserId(4, 20, undefined, 2);

      expect(defaultQb.skip).toHaveBeenCalledWith(20);
      expect(defaultQb.take).toHaveBeenCalledWith(20);
      expect(result.data).toHaveLength(1);
      expect(result.pagination).toEqual({ page: 2, limit: 20, total: 21, totalPages: 2 });
    });
  });

  describe('getHotResources – filters disabled categories', () => {
    it('uses createQueryBuilder with LEFT JOIN and category filter', async () => {
      const { service, resourceRepository, defaultQb } = createService();
      defaultQb.getMany.mockResolvedValue([]);

      await service.getHotResources();

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
      expect(defaultQb.andWhere).toHaveBeenCalledWith(
        '(category.id IS NULL OR category.is_active = :categoryActive)',
        { categoryActive: 1 },
      );
    });

    it('orders by download_count DESC and limits results', async () => {
      const { service, defaultQb } = createService();
      defaultQb.getMany.mockResolvedValue([]);

      await service.getHotResources(5);

      expect(defaultQb.orderBy).toHaveBeenCalledWith('resource.download_count', 'DESC');
      expect(defaultQb.take).toHaveBeenCalledWith(5);
    });
  });
});
