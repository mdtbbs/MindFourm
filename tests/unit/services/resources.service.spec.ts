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
    innerJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
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
      const { service } = createService({
        categoryService: {
          getById: jest.fn().mockRejectedValue(new Error('分类不存在')),
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
      expect(defaultQb.innerJoin).toHaveBeenCalledWith('resource.category', 'category');
      expect(defaultQb.andWhere).toHaveBeenCalledWith(
        'resource.is_public = :isPublic',
        { isPublic: 1 },
      );
      expect(defaultQb.andWhere).toHaveBeenCalledWith(
        'category.is_active = :categoryActive',
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
});
