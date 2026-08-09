const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  NotFoundException: class NotFoundException extends Error {},
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
}));

jest.mock('@entities/resource-category.entity', () => ({
  ResourceCategory: class ResourceCategory {},
}));

import { ResourceCategoryService } from '@modules/resources/resource-categories.service';

function createService(overrides: {
  categoryRepository?: Record<string, jest.Mock>;
} = {}) {
  const categoryRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((v: unknown) => v),
    save: jest.fn().mockImplementation(async (v: unknown) => v),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    })),
    manager: {
      count: jest.fn().mockResolvedValue(0),
    },
    ...overrides.categoryRepository,
  };

  const dataSource = {};

  return new ResourceCategoryService(categoryRepository as any, dataSource as any);
}

describe('ResourceCategoryService - Public Visibility', () => {
  describe('getPublicCategories', () => {
    it('should return only enabled categories', async () => {
      const mockCategories = [
        { id: 1, name: 'Active', is_active: 1, sort_order: 1 },
        { id: 2, name: 'Disabled', is_active: 0, sort_order: 2 },
        { id: 3, name: 'Another Active', is_active: 1, sort_order: 3 },
      ];

      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockCategories[0], mockCategories[2]]),
      };

      const service = createService({
        categoryRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(qb),
        },
      });

      const result = await service.getPublicCategories();

      expect(qb.where).toHaveBeenCalledWith('category.is_active = :isActive', { isActive: 1 });
      expect(result).toHaveLength(2);
      expect(result.every((c: any) => c.is_active === 1)).toBe(true);
    });

    it('should order by sort_order ASC, id ASC', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const service = createService({
        categoryRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(qb),
        },
      });

      await service.getPublicCategories();

      expect(qb.orderBy).toHaveBeenCalledWith('category.sort_order', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('category.id', 'ASC');
    });
  });

  describe('getAllCategories', () => {
    it('should return all categories including disabled', async () => {
      const mockCategories = [
        { id: 1, name: 'Active', is_active: 1 },
        { id: 2, name: 'Disabled', is_active: 0 },
      ];

      const service = createService({
        categoryRepository: {
          find: jest.fn().mockResolvedValue(mockCategories),
        },
      });

      const result = await service.getAllCategories();

      expect(result).toHaveLength(2);
    });
  });
});
