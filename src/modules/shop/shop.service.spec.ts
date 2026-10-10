const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
  EntityManager: class EntityManager {},
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

// The service only needs the classes as identity tokens (`manager.findOne(ShopItem, …)`,
// `manager.create(Purchase, …)`); the real ones would drag the whole entity graph in.
jest.mock('@entities/shop-item.entity', () => ({ ShopItem: class ShopItem {} }));
jest.mock('@entities/purchase.entity', () => ({ Purchase: class Purchase {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShopItem } from '@entities/shop-item.entity';
import { Purchase } from '@entities/purchase.entity';
import { ShopService } from './shop.service';

interface StubItem {
  id: number;
  name?: string;
  points_cost: number;
  stock?: number;
  is_active: number;
}

function createService(options: {
  items?: StubItem[];
  pages?: Record<number, StubItem> | null;
  stockAffected?: number;
} = {}) {
  const items = options.items ?? [{
    id: 1, name: '徽章', points_cost: 100, stock: 3, is_active: 1,
  }];
  // Only these ids answer the in-transaction read; `null` means "every id".
  const transactionItems = options.pages === null
    ? items
    : options.pages ?? { 1: items[0] };

  const stockExecute = jest.fn(async () => ({ affected: options.stockAffected ?? 1 }));
  const stockWhere = jest.fn();
  const stockAndWhere = jest.fn();
  const stockSet = jest.fn();
  const stockUpdate = jest.fn(() => ({}));

  const createQueryBuilder = jest.fn(() => {
    const builder: any = {};
    builder.update = stockUpdate.mockImplementation(() => builder);
    builder.set = stockSet.mockImplementation(() => builder);
    builder.where = stockWhere.mockImplementation(() => builder);
    builder.andWhere = stockAndWhere.mockImplementation(() => builder);
    builder.execute = stockExecute;
    return builder;
  });

  const manager = {
    findOne: jest.fn(async (entity: unknown, opts: any) => {
      if (entity !== ShopItem) return null;
      return transactionItems[opts?.where?.id] ?? null;
    }),
    createQueryBuilder,
    create: jest.fn((_entity: unknown, value: Record<string, unknown>) => ({ ...value })),
    save: jest.fn(async (_entity: unknown, value: Record<string, unknown>) => ({
      id: 7, ...value,
    })),
  };

  const shopItemRepo = {
    findAndCount: jest.fn(async () => [items, items.length]),
    findOne: jest.fn(async ({ where }: { where: { id: number } }) =>
      (options.pages === null ? items : Object.values(options.pages ?? { 1: items[0] }))
        .find((item) => item.id === where.id) ?? null),
    find: jest.fn(async () => items),
    create: jest.fn((value: Record<string, unknown>) => ({ ...value })),
    save: jest.fn(async (value: Record<string, unknown>) => ({ id: 5, ...value })),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
  const purchaseRepo = {
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const pointsService = {
    deductPoints: jest.fn(async () => ({ id: 11 })),
  };
  const dataSource = {
    transaction: jest.fn(async (run: (em: unknown) => Promise<unknown>) => run(manager)),
  };

  const service = new ShopService(
    shopItemRepo as never,
    purchaseRepo as never,
    {} as never,
    dataSource as never,
    pointsService as never,
  );

  return {
    service,
    shopItemRepo,
    purchaseRepo,
    pointsService,
    dataSource,
    manager,
    items,
    stockWhere,
    stockAndWhere,
    stockSet,
    stockExecute,
  };
}

describe('ShopService.getShopItems', () => {
  it('caps an oversized limit at 50 and reports the applied limit', async () => {
    const { service, shopItemRepo } = createService();

    const result = await service.getShopItems(2, 100);

    expect(shopItemRepo.findAndCount).toHaveBeenCalledWith({
      where: { is_active: 1 },
      order: { sort_order: 'ASC', created_at: 'DESC' },
      skip: 50,
      take: 50,
    });
    expect(result.limit).toBe(50);
  });

  it('defaults to page 1 / limit 20', async () => {
    const { service, shopItemRepo } = createService();

    const result = await service.getShopItems();

    expect(shopItemRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
    expect(result).toMatchObject({ page: 1, limit: 20 });
  });

  it('only lists active items', async () => {
    const { service, shopItemRepo } = createService();

    await service.getShopItems(1, 20);

    expect(shopItemRepo.findAndCount.mock.calls[0][0].where).toEqual({ is_active: 1 });
  });

  it('computes totalPages from the capped limit', async () => {
    const { service } = createService({
      items: Array.from({ length: 60 }, (_, index) => ({
        id: index + 1, points_cost: 10, stock: 1, is_active: 1,
      })),
    });

    const result = await service.getShopItems(1, 100);

    expect(result.total).toBe(60);
    expect(result.totalPages).toBe(2);
  });
});

describe('ShopService.getItemById', () => {
  it('returns the item when it exists', async () => {
    const { service, items } = createService();

    await expect(service.getItemById(1)).resolves.toEqual(items[0]);
  });

  it('throws NotFound instead of returning null', async () => {
    const { service } = createService({ pages: {} });

    await expect(service.getItemById(404)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ShopService.purchase', () => {
  it('commits stock, points and the purchase row together', async () => {
    const { service, manager, pointsService } = createService();

    const purchase = await service.purchase(3, 1);

    expect(purchase).toMatchObject({
      user_id: 3, item_id: 1, points_spent: 100, status: 'completed',
    });
    expect(manager.save).toHaveBeenCalledWith(Purchase, expect.objectContaining({ user_id: 3 }));
  });

  it('debits points through PointsService inside the same transaction', async () => {
    const { service, pointsService, manager } = createService();

    await service.purchase(3, 1);

    expect(pointsService.deductPoints).toHaveBeenCalledWith(
      3, 100, 'shop_purchase', 'shop_item', 1, manager,
    );
  });

  it('decrements stock with a conditional UPDATE rather than check-then-write', async () => {
    const { service, stockWhere, stockAndWhere, stockSet } = createService();

    await service.purchase(3, 1);

    // The guard lives in the WHERE clause; a JS-side `stock <= 0` read would let
    // two concurrent buyers take the last unit.
    const conditions = [
      ...stockWhere.mock.calls.map((call) => String(call[0])),
      ...stockAndWhere.mock.calls.map((call) => String(call[0])),
    ];
    expect(conditions).toContain('stock > 0');
    expect(conditions).toContain('is_active = 1');
    expect(stockSet.mock.calls[0][0].stock()).toBe('stock - 1');
  });

  it('reports a missing item as not found without touching stock', async () => {
    const { service, manager, stockExecute, pointsService } = createService({ pages: {} });

    await expect(service.purchase(3, 404)).rejects.toBeInstanceOf(NotFoundException);
    expect(stockExecute).not.toHaveBeenCalled();
    expect(pointsService.deductPoints).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a delisted item before decrementing stock', async () => {
    const { service, stockExecute, pointsService } = createService({
      pages: { 1: { id: 1, points_cost: 100, stock: 5, is_active: 0 } },
    });

    await expect(service.purchase(3, 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.purchase(3, 1)).rejects.toThrow('商品已下架');
    expect(stockExecute).not.toHaveBeenCalled();
    expect(pointsService.deductPoints).not.toHaveBeenCalled();
  });

  it('rolls back and charges nothing when the last unit is gone', async () => {
    const { service, manager, pointsService } = createService({ stockAffected: 0 });

    await expect(service.purchase(3, 1)).rejects.toThrow('商品库存不足');
    expect(pointsService.deductPoints).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('propagates an insufficient balance and records no purchase', async () => {
    const { service, manager, pointsService } = createService();
    pointsService.deductPoints.mockRejectedValueOnce(new BadRequestException('积分不足'));

    await expect(service.purchase(3, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('runs everything the purchase touches inside one transaction', async () => {
    const { service, dataSource, manager } = createService();

    await service.purchase(3, 1);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenCalledWith(ShopItem, { where: { id: 1 } });
  });
});

describe('ShopService.getUserPurchases', () => {
  it('caps the limit and filters by user', async () => {
    const { service, purchaseRepo } = createService();

    const result = await service.getUserPurchases(3, 1, 500);

    expect(purchaseRepo.findAndCount).toHaveBeenCalledWith({
      where: { user_id: 3 },
      relations: ['item'],
      order: { created_at: 'DESC' },
      skip: 0,
      take: 50,
    });
    expect(result).toMatchObject({ limit: 50, totalPages: 0 });
  });

  it('widens the offset by the capped limit', async () => {
    const { service, purchaseRepo } = createService();

    await service.getUserPurchases(3, 3, 50);

    expect(purchaseRepo.findAndCount.mock.calls[0][0].skip).toBe(100);
  });
});

describe('ShopService admin API', () => {
  it('creates an item', async () => {
    const { service, shopItemRepo } = createService();

    const created = await service.adminCreateItem({ name: '徽章', points_cost: 100 });

    expect(shopItemRepo.save).toHaveBeenCalledWith({ name: '徽章', points_cost: 100 });
    expect(created).toMatchObject({ id: 5, name: '徽章' });
  });

  it('updates an existing item', async () => {
    const { service, shopItemRepo } = createService();

    const updated = await service.adminUpdateItem(1, { points_cost: 250 });

    expect(updated).toMatchObject({ id: 1, points_cost: 250 });
    expect(shopItemRepo.save).toHaveBeenCalledTimes(1);
  });

  it('reports an update of a missing item as not found', async () => {
    const { service, shopItemRepo } = createService({ pages: {} });

    await expect(service.adminUpdateItem(404, { points_cost: 1 }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(shopItemRepo.save).not.toHaveBeenCalled();
  });

  it('reports a delete that matched no row as not found', async () => {
    const { service, shopItemRepo } = createService();
    shopItemRepo.delete.mockResolvedValueOnce({ affected: 0 });

    await expect(service.adminDeleteItem(9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a matching row silently', async () => {
    const { service } = createService();

    await expect(service.adminDeleteItem(1)).resolves.toBeUndefined();
  });
});
