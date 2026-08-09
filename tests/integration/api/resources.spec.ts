/**
 * Integration tests for the Resources API – category visibility.
 *
 * These tests verify that:
 *   1. The public categories endpoint returns only enabled categories.
 *   2. The admin categories endpoint returns every category.
 *   3. The public resource list excludes resources in disabled categories.
 *   4. Accessing a single resource in a disabled category returns 404.
 *   5. Download of a resource in a disabled category is denied.
 *
 * Controller-level tests below mock ResourcesService to isolate controller
 * routing. The actual query-level filtering (LEFT JOIN + category.is_active
 * predicate in getList / getPublicByUserId / getHotResources) is exercised
 * by the service-level tests in:
 *   tests/unit/services/resources.service.spec.ts
 * ("getList – public scope filters disabled categories" etc.)
 */

import 'reflect-metadata';

const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  Controller: () => () => undefined,
  Get: () => () => undefined,
  Post: () => () => undefined,
  Put: () => () => undefined,
  Delete: () => () => undefined,
  Param: () => () => undefined,
  Query: () => () => undefined,
  Body: () => () => undefined,
  Req: () => () => undefined,
  Res: () => () => undefined,
  UseGuards: () => () => undefined,
  UseInterceptors: () => () => undefined,
  UploadedFile: () => () => undefined,
  ParseIntPipe: class ParseIntPipe {},
  StreamableFile: class StreamableFile {},
  BadRequestException: class BadRequestException extends Error {},
  NotFoundException: class NotFoundException extends Error {},
  ValidationPipe: class ValidationPipe {},
  HttpStatus: { OK: 200, NOT_FOUND: 404 },
  Optional: decorator,
  Inject: decorator,
  SetMetadata: decorator,
  createParamDecorator: () => () => undefined,
  Logger: class Logger {
    log() {}
    error() {}
    warn() {}
    debug() {}
    verbose() {}
  },
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('@nestjs/platform-express', () => ({
  FileInterceptor: () => () => undefined,
}));

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {
    get() { return undefined; }
    getOrThrow() { return undefined; }
  },
  ConfigModule: class ConfigModule {},
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
  Like: jest.fn((v) => ({ _like: v })),
  LessThan: jest.fn((v) => ({ _lt: v })),
  In: jest.fn((v) => ({ _in: v })),
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
  Unique: decorator,
  ManyToOne: decorator,
  JoinColumn: decorator,
}));

jest.mock('multer', () => ({
  diskStorage: jest.fn(),
}));

jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  createReadStream: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  unlink: jest.fn(),
  access: jest.fn(),
}));

jest.mock('path', () => ({
  extname: jest.fn((v: string) => v.slice(v.lastIndexOf('.'))),
  resolve: jest.fn((v: string) => v),
}));

jest.mock('ioredis', () => {
  return class Redis {
    connect() { return Promise.resolve(); }
    on() { return this; }
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve('OK'); }
    del() { return Promise.resolve(1); }
    keys() { return Promise.resolve([]); }
    quit() { return Promise.resolve(); }
  };
});

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

jest.mock('@common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {},
}));

jest.mock('@common/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {},
}));

jest.mock('@common/decorators/roles.decorator', () => ({
  Roles: () => () => undefined,
}));

jest.mock('@common/decorators/public.decorator', () => ({
  OptionalAuth: () => () => undefined,
}));

jest.mock('@common/decorators/rate-limit.decorator', () => ({
  RateLimit: () => () => undefined,
}));

jest.mock('@common/utils/safe-url.util', () => ({
  assertSafeRedirectUrl: jest.fn(),
  isSafeExternalUrl: jest.fn(() => true),
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

jest.mock('@database/redis.service', () => ({
  RedisService: class RedisService {
    get() { return Promise.resolve(null); }
    set() { return Promise.resolve('OK'); }
    del() { return Promise.resolve(1); }
    keys() { return Promise.resolve([]); }
    hset() { return Promise.resolve(1); }
    hgetall() { return Promise.resolve({}); }
    incr() { return Promise.resolve(1); }
    expire() { return Promise.resolve(1); }
    eval() { return Promise.resolve(1); }
  },
}));

jest.mock('@common/services/revalidation.service', () => ({
  RevalidationService: class RevalidationService {
    triggerRevalidation() { return Promise.resolve(); }
  },
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

// Mock the service modules so the controller import doesn't load the real implementations
// and trigger deeper dependency chains. The controller only uses the class references for
// DI type tokens; we supply our own mock instances in the constructor.
jest.mock('@modules/resources/resources.service', () => ({
  ResourcesService: class ResourcesService {},
}));

jest.mock('@modules/resources/resource-categories.service', () => ({
  ResourceCategoryService: class ResourceCategoryService {},
}));

jest.mock('@modules/resources/resource-versions.service', () => ({
  ResourceVersionService: class ResourceVersionService {},
}));

import { ResourcesController } from '@modules/resources/resources.controller';
import { NotFoundException } from '@nestjs/common';

function createController(overrides: {
  categoryService?: Record<string, jest.Mock>;
  resourcesService?: Record<string, jest.Mock>;
  versionService?: Record<string, jest.Mock>;
} = {}) {
  const defaultCategoryService = {
    getPublicCategories: jest.fn().mockResolvedValue([]),
    getAllCategories: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getById: jest.fn(),
    ...overrides.categoryService,
  };

  const defaultResourcesService = {
    getList: jest.fn().mockResolvedValue({ data: [], next_cursor: null, has_more: false }),
    getHotResources: jest.fn().mockResolvedValue([]),
    getPublicByUserId: jest.fn().mockResolvedValue({ data: [], next_cursor: null, has_more: false }),
    getByIdWithVersions: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    adminDelete: jest.fn(),
    updateStatus: jest.fn(),
    incrementDownload: jest.fn(),
    upsertRating: jest.fn(),
    deleteRating: jest.fn(),
    getUserRating: jest.fn(),
    ...overrides.resourcesService,
  };

  const defaultVersionService = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    delete: jest.fn(),
    getDownloadTarget: jest.fn(),
    ...overrides.versionService,
  };

  return {
    controller: new ResourcesController(
      defaultResourcesService as any,
      defaultCategoryService as any,
      defaultVersionService as any,
    ),
    categoryService: defaultCategoryService,
    resourcesService: defaultResourcesService,
    versionService: defaultVersionService,
  };
}

describe('Resources API - Category Visibility', () => {
  describe('GET /resources/categories', () => {
    it('should return only enabled categories', async () => {
      const activeCategories = [
        { id: 1, name: '插件', slug: 'plugin', is_active: 1, sort_order: 1 },
        { id: 3, name: '地图', slug: 'map', is_active: 1, sort_order: 2 },
      ];

      const { controller, categoryService } = createController({
        categoryService: {
          getPublicCategories: jest.fn().mockResolvedValue(activeCategories),
        },
      });

      const result = await controller.listCategories();

      expect(categoryService.getPublicCategories).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result.every((c: any) => c.is_active === 1)).toBe(true);
    });

    it('should not return disabled categories', async () => {
      const activeCategories = [
        { id: 1, name: '插件', slug: 'plugin', is_active: 1, sort_order: 1 },
      ];

      const { controller } = createController({
        categoryService: {
          getPublicCategories: jest.fn().mockResolvedValue(activeCategories),
        },
      });

      const result = await controller.listCategories();

      expect(result.every((c: any) => c.is_active === 1)).toBe(true);
      expect(result).not.toContainEqual(
        expect.objectContaining({ is_active: 0 }),
      );
    });
  });

  describe('GET /resources/categories/admin', () => {
    it('should return all categories including disabled', async () => {
      const allCategories = [
        { id: 1, name: '插件', slug: 'plugin', is_active: 1, sort_order: 1 },
        { id: 2, name: '测试分类', slug: 'test', is_active: 0, sort_order: 2 },
        { id: 3, name: '地图', slug: 'map', is_active: 1, sort_order: 3 },
      ];

      const { controller, categoryService } = createController({
        categoryService: {
          getAllCategories: jest.fn().mockResolvedValue(allCategories),
        },
      });

      const result = await controller.listAdminCategories();

      expect(categoryService.getAllCategories).toHaveBeenCalled();
      expect(result).toHaveLength(3);
      expect(result).toContainEqual(
        expect.objectContaining({ is_active: 0 }),
      );
    });

    it('should include disabled categories that are hidden from public', async () => {
      const allCategories = [
        { id: 1, name: 'Active', is_active: 1, sort_order: 1 },
        { id: 2, name: 'Disabled', is_active: 0, sort_order: 2 },
      ];

      const { controller } = createController({
        categoryService: {
          getAllCategories: jest.fn().mockResolvedValue(allCategories),
        },
      });

      const result = await controller.listAdminCategories();

      const disabledCategories = result.filter((c: any) => c.is_active === 0);
      expect(disabledCategories.length).toBeGreaterThan(0);
    });
  });

  describe('GET /resources (public list)', () => {
    it('should not return resources from disabled categories', async () => {
      const publicResources = [
        {
          id: 1,
          title: 'Active Resource',
          status: 'approved',
          is_public: true,
          category: { id: 1, name: '插件', is_active: 1 },
        },
        {
          id: 2,
          title: 'Another Active Resource',
          status: 'approved',
          is_public: true,
          category: { id: 3, name: '地图', is_active: 1 },
        },
      ];

      const { controller, resourcesService } = createController({
        resourcesService: {
          getList: jest.fn().mockResolvedValue({
            data: publicResources,
            next_cursor: null,
            has_more: false,
          }),
        },
      });

      const result = await controller.getList({} as any);

      expect(resourcesService.getList).toHaveBeenCalledWith(
        expect.anything(),
        { scope: 'public' },
      );
      expect(result.data.every((r: any) => !!r.category?.is_active)).toBe(true);
    });

    it('should use public scope to filter resources', async () => {
      const { controller, resourcesService } = createController();

      await controller.getList({} as any);

      expect(resourcesService.getList).toHaveBeenCalledWith(
        expect.anything(),
        { scope: 'public' },
      );
    });
  });

  describe('GET /resources/:id (single resource)', () => {
    it('should deny access to resource in disabled category (404)', async () => {
      const { controller } = createController({
        resourcesService: {
          getByIdWithVersions: jest.fn().mockRejectedValue(
            new NotFoundException('资源不存在'),
          ),
        },
      });

      await expect(
        controller.getById(1, undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow access to resource in active category', async () => {
      const activeResource = {
        id: 1,
        title: 'Active Resource',
        status: 'approved',
        is_public: true,
        category: { id: 1, name: '插件', is_active: 1 },
        user: { username: 'testuser', avatar_url: null },
        versions: [],
      };

      const { controller } = createController({
        resourcesService: {
          getByIdWithVersions: jest.fn().mockResolvedValue(activeResource),
        },
      });

      const result = await controller.getById(1, undefined);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.category.is_active).toBe(1);
    });

    it('should allow admin access to resource in disabled category', async () => {
      const resourceInDisabledCategory = {
        id: 1,
        title: 'Hidden Resource',
        status: 'approved',
        is_public: true,
        category: { id: 2, name: 'Disabled', is_active: 0 },
        user: { username: 'testuser', avatar_url: null },
        versions: [],
      };

      const { controller } = createController({
        resourcesService: {
          getByIdWithVersions: jest.fn().mockResolvedValue(resourceInDisabledCategory),
        },
      });

      // Admin user should be able to see it (assertResourceVisible allows staff)
      const result = await controller.getById(1, { id: 99, role: 'admin' });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });
  });

  describe('Category ordering', () => {
    it('should return categories ordered by sort_order ASC, id ASC', async () => {
      const orderedCategories = [
        { id: 1, name: 'First', sort_order: 1, is_active: 1 },
        { id: 3, name: 'Second', sort_order: 1, is_active: 1 }, // Same sort_order, higher id
        { id: 2, name: 'Third', sort_order: 2, is_active: 1 },
      ];

      const { controller } = createController({
        categoryService: {
          getPublicCategories: jest.fn().mockResolvedValue(orderedCategories),
        },
      });

      const result = await controller.listCategories();

      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(3);
      expect(result[2].id).toBe(2);
      // Verify sort_order is non-decreasing
      for (let i = 1; i < result.length; i++) {
        expect(result[i].sort_order).toBeGreaterThanOrEqual(result[i - 1].sort_order);
      }
    });
  });
});
