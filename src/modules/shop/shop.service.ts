import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ShopItem } from '@entities/shop-item.entity';
import { Purchase } from '@entities/purchase.entity';
import { User } from '@entities/user.entity';
import { PointsService } from '../points/points.service';

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
    private pointsService: PointsService,
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
      // The item is read only for its price and for the 404/下架 messages. Both
      // the stock and balance checks below are enforced by the database, not by
      // what this snapshot says.
      const item = await manager.findOne(ShopItem, { where: { id: itemId } });
      if (!item) throw new NotFoundException('商品不存在');
      if (!item.is_active) throw new BadRequestException('商品已下架');

      // Conditional UPDATE rather than check-then-decrement: two buyers racing for
      // the last unit both passed an `item.stock <= 0` guard read moments earlier
      // and the item oversold to -1.
      const stockResult = await manager
        .createQueryBuilder()
        .update(ShopItem)
        .set({ stock: () => 'stock - 1' })
        .where('id = :itemId', { itemId })
        .andWhere('stock > 0')
        .andWhere('is_active = 1')
        .execute();

      if (!stockResult.affected) {
        throw new BadRequestException('商品库存不足');
      }

      // Delegated so the balance check is the same conditional UPDATE used
      // everywhere else, and so the spend lands in `point_logs` — purchases used
      // to decrement `available_points` directly and never appeared in a user's
      // point history. `manager` keeps the debit inside this transaction.
      await this.pointsService.deductPoints(
        userId,
        item.points_cost,
        'shop_purchase',
        'shop_item',
        itemId,
        manager,
      );

      const purchase = manager.create(Purchase, {
        user_id: userId,
        item_id: itemId,
        points_spent: item.points_cost,
        status: 'completed',
      });

      return manager.save(Purchase, purchase);
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
