const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  NotFoundException: class NotFoundException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
  BadRequestException: class BadRequestException extends Error {},
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
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

import { ResourcesService } from '@modules/resources/resources.service';
import { ResourceCategoryService } from '@modules/resources/resource-categories.service';

function createService(overrides: {
  resourceRepository?: Record<string, jest.Mock>;
  categoryService?: Partial<Record<keyof ResourceCategoryService, jest.Mock>>;
} = {}) {
  const defaultQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
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

  return {
    service: new ResourcesService(
      resourceRepository as any,
      {} as any, // userRepository
      {} as any, // categoryRepository
      {} as any, // versionRepository
      {} as any, // ratingRepository
      {} as any, // dataSource
      { publishModerationPending: jest.fn(), publishModerationResult: jest.fn() } as any,
      { create: jest.fn() } as any,
      { uploadFile: jest.fn(), getDownloadUrl: jest.fn(), blockDownloads: jest.fn(), updateApprovalStatus: jest.fn() } as any,
      categoryService as any,
    ),
    resourceRepository,
    categoryService,
    defaultQb,
  };
}

describe('ResourcesService - Public Visibility', () => {
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
      defaultQb.getMany.mockResolvedValue(fakeResources);

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
        'resource.status = :status',
        { status: 'approved' },
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
