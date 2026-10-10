// The guards pull AuthService/BansService (and their entity graphs) in; only their
// presence as decorator arguments matters here.
jest.mock('@common/guards/jwt-auth.guard', () => ({ JwtAuthGuard: class JwtAuthGuard {} }));
jest.mock('@common/guards/roles.guard', () => ({ RolesGuard: class RolesGuard {} }));
jest.mock('./shop.service', () => ({ ShopService: class ShopService {} }));

import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

const SHOP_ITEM = { id: 1, name: '徽章', points_cost: 100, stock: 3, is_active: 1 };

function createController() {
  const shopService = {
    getShopItems: jest.fn().mockResolvedValue({
      items: [SHOP_ITEM], total: 1, page: 1, limit: 20, totalPages: 1,
    }),
    getItemById: jest.fn().mockResolvedValue(SHOP_ITEM),
    purchase: jest.fn().mockResolvedValue({ id: 7, user_id: 3, item_id: 1 }),
    getUserPurchases: jest.fn().mockResolvedValue({
      purchases: [], total: 0, page: 1, limit: 20, totalPages: 0,
    }),
    adminGetItems: jest.fn().mockResolvedValue([SHOP_ITEM]),
    adminCreateItem: jest.fn().mockResolvedValue(SHOP_ITEM),
    adminUpdateItem: jest.fn().mockResolvedValue(SHOP_ITEM),
    adminDeleteItem: jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new ShopController(shopService as unknown as ShopService),
    shopService,
  };
}

const req = (userId?: number) => ({ user: userId === undefined ? undefined : { id: userId } } as any);

describe('ShopController pagination envelope', () => {
  it('renames the service list to `data` and keeps all four pagination keys', async () => {
    // The shop page read `res.data`; the service names the list `items`, and when
    // the raw payload leaked through the page rendered as permanently empty.
    const { controller } = createController();

    const result = await controller.getShopItems({ page: 1, limit: 20 } as any);

    expect(result).toEqual({
      data: [SHOP_ITEM],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('renames the purchases list too', async () => {
    const { controller } = createController();

    const result = await controller.getMyPurchases(req(3), {} as any);

    expect(result.data).toEqual([]);
  });

  it('never reports zero total pages', async () => {
    const { controller, shopService } = createController();
    shopService.getShopItems.mockResolvedValue({
      items: [], total: 0, page: 1, limit: 20, totalPages: 0,
    });

    const result = await controller.getShopItems({} as any);

    expect(result.pagination.totalPages).toBe(1);
  });

  it('defaults page and limit when the query omits them', async () => {
    const { controller, shopService } = createController();

    await controller.getShopItems({} as any);
    await controller.getMyPurchases(req(3), {} as any);

    expect(shopService.getShopItems).toHaveBeenCalledWith(1, 20);
    expect(shopService.getUserPurchases).toHaveBeenCalledWith(3, 1, 20);
  });

  it('passes explicit page and limit through untouched', async () => {
    const { controller, shopService } = createController();

    await controller.getShopItems({ page: 3, limit: 50 } as any);

    expect(shopService.getShopItems).toHaveBeenCalledWith(3, 50);
  });
});

describe('ShopController delegation', () => {
  it('purchases for the session user', async () => {
    const { controller, shopService } = createController();

    const purchase = await controller.purchase(1 as any, req(3));

    expect(shopService.purchase).toHaveBeenCalledWith(3, 1);
    expect(purchase).toMatchObject({ id: 7 });
  });

  it('returns a bare item payload from getItemById', async () => {
    const { controller } = createController();

    await expect(controller.getItemById(1 as any)).resolves.toEqual(SHOP_ITEM);
  });

  it('confirms deletion', async () => {
    const { controller, shopService } = createController();

    await expect(controller.adminDeleteItem(1 as any)).resolves.toEqual({ message: '商品已删除' });
    expect(shopService.adminDeleteItem).toHaveBeenCalledWith(1);
  });
});
