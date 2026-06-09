import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ShopItem } from '@entities/shop-item.entity';
import { Purchase } from '@entities/purchase.entity';
import { User } from '@entities/user.entity';

@Injectable()
export class ShopService {
  constructor(
    @InjectRepository(ShopItem)
    private shopItemRepo: Repository<ShopItem>,
    @InjectRepository(Purchase)
    private purchaseRepo: Repository<Purchase>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private dataSource: DataSource,
  ) {}

  // === Public API ===

  async getShopItems(page: number = 1, limit: number = 20) {
    const cappedLimit = Math.min(limit, 50);
    const skip = (page - 1) * cappedLimit;

    const [items, total] = await this.shopItemRepo.findAndCount({
      where: { is_active: 1 },
      order: { sort_order: 'ASC', created_at: 'DESC' },
      skip,
      take: cappedLimit,
    });

    return { items, total, page, limit: cappedLimit, totalPages: Math.ceil(total / cappedLimit) };
  }

  async getItemById(id: number): Promise<ShopItem> {
    const item = await this.shopItemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('商品不存在');
    return item;
  }

  async purchase(userId: number, itemId: number): Promise<Purchase> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Check user exists and has enough points
      const user = await manager.findOne(User, {
        where: { id: userId },
        select: ['id', 'available_points'],
      });
      if (!user) throw new NotFoundException('用户不存在');

      // 2. Check item exists, active, and has stock
      const item = await manager.findOne(ShopItem, { where: { id: itemId } });
      if (!item) throw new NotFoundException('商品不存在');
      if (!item.is_active) throw new BadRequestException('商品已下架');
      if (item.stock <= 0) throw new BadRequestException('商品库存不足');

      if (user.available_points < item.points_cost) {
        throw new BadRequestException('积分不足，需要 ' + item.points_cost + ' 积分');
      }

      // 3. Deduct points
      await manager.decrement(User, { id: userId }, 'available_points', item.points_cost);

      // 4. Create purchase record
      const purchase = manager.create(Purchase, {
        user_id: userId,
        item_id: itemId,
        points_spent: item.points_cost,
        status: 'completed',
      });
      const savedPurchase = await manager.save(Purchase, purchase);

      // 5. Decrease stock
      await manager.decrement(ShopItem, { id: itemId }, 'stock', 1);

      return savedPurchase;
    });
  }

  async getUserPurchases(userId: number, page: number = 1, limit: number = 20) {
    const cappedLimit = Math.min(limit, 50);
    const skip = (page - 1) * cappedLimit;

    const [purchases, total] = await this.purchaseRepo.findAndCount({
      where: { user_id: userId },
      relations: ['item'],
      order: { created_at: 'DESC' },
      skip,
      take: cappedLimit,
    });

    return {
      purchases,
      total,
      page,
      limit: cappedLimit,
      totalPages: Math.ceil(total / cappedLimit),
    };
  }

  // === Admin API ===

  async adminGetItems(): Promise<ShopItem[]> {
    return this.shopItemRepo.find({ order: { created_at: 'DESC' } });
  }

  async adminCreateItem(data: Partial<ShopItem>): Promise<ShopItem> {
    const item = this.shopItemRepo.create(data);
    return this.shopItemRepo.save(item);
  }

  async adminUpdateItem(id: number, data: Partial<ShopItem>): Promise<ShopItem> {
    const item = await this.shopItemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('商品不存在');
    Object.assign(item, data);
    return this.shopItemRepo.save(item);
  }

  async adminDeleteItem(id: number): Promise<void> {
    const result = await this.shopItemRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('商品不存在');
  }
}
