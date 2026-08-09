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

    it('should order by sort_order ASC, then by id ASC', async () => {
      const mockCategories = [
        { id: 1, name: 'A', sort_order: 1 },
        { id: 3, name: 'C', sort_order: 1 },
        { id: 2, name: 'B', sort_order: 2 },
      ];

      const findMock = jest.fn().mockResolvedValue(mockCategories);
      const service = createService({
        categoryRepository: {
          find: findMock,
        },
      });

      const result = await service.getAllCategories();

      expect(findMock).toHaveBeenCalledWith({
        order: { sort_order: 'ASC', id: 'ASC' },
      });
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(3);
      expect(result[2].id).toBe(2);
    });
  });

  describe('list', () => {
    it('should order by sort_order ASC, then by id ASC (stable sort)', async () => {
      const findMock = jest.fn().mockResolvedValue([]);
      const service = createService({
        categoryRepository: {
          find: findMock,
        },
      });

      await service.list(false);

      expect(findMock).toHaveBeenCalledWith({
        where: { is_active: 1 },
        order: { sort_order: 'ASC', id: 'ASC' },
      });
    });
  });

  describe('create - default sort_order', () => {
    it('should set sort_order to max + 1 when not provided', async () => {
      const getRawOneMock = jest.fn().mockResolvedValue({ max: 5 });
      const createMock = jest.fn().mockImplementation((v: unknown) => v);
      const saveMock = jest.fn().mockImplementation(async (v: unknown) => v);

      const service = createService({
        categoryRepository: {
          findOne: jest.fn().mockResolvedValue(null),
          createQueryBuilder: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            getRawOne: getRawOneMock,
          }),
          create: createMock,
          save: saveMock,
        },
      });

      const result = await service.create({ name: 'Test', slug: 'test' });

      expect(getRawOneMock).toHaveBeenCalled();
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ sort_order: 6 }),
      );
      expect(result.sort_order).toBe(6);
    });

    it('should use provided sort_order when given', async () => {
      const createMock = jest.fn().mockImplementation((v: unknown) => v);
      const saveMock = jest.fn().mockImplementation(async (v: unknown) => v);
      const createQbMock = jest.fn();

      const service = createService({
        categoryRepository: {
          findOne: jest.fn().mockResolvedValue(null),
          createQueryBuilder: createQbMock,
          create: createMock,
          save: saveMock,
        },
      });

      const result = await service.create({ name: 'Test', slug: 'test', sort_order: 10 });

      expect(createQbMock).not.toHaveBeenCalled();
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ sort_order: 10 }),
      );
      expect(result.sort_order).toBe(10);
    });

    it('should default to 1 when no categories exist', async () => {
      const getRawOneMock = jest.fn().mockResolvedValue({ max: null });
      const createMock = jest.fn().mockImplementation((v: unknown) => v);
      const saveMock = jest.fn().mockImplementation(async (v: unknown) => v);

      const service = createService({
        categoryRepository: {
          findOne: jest.fn().mockResolvedValue(null),
          createQueryBuilder: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            getRawOne: getRawOneMock,
          }),
          create: createMock,
          save: saveMock,
        },
      });

      const result = await service.create({ name: 'First', slug: 'first' });

      expect(result.sort_order).toBe(1);
    });
  });
});
