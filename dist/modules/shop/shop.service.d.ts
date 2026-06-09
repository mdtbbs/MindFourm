import { Repository, DataSource } from 'typeorm';
import { ShopItem } from '@entities/shop-item.entity';
import { Purchase } from '@entities/purchase.entity';
import { User } from '@entities/user.entity';
export declare class ShopService {
    private shopItemRepo;
    private purchaseRepo;
    private userRepo;
    private dataSource;
    constructor(shopItemRepo: Repository<ShopItem>, purchaseRepo: Repository<Purchase>, userRepo: Repository<User>, dataSource: DataSource);
    getShopItems(page?: number, limit?: number): Promise<{
        items: ShopItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getItemById(id: number): Promise<ShopItem>;
    purchase(userId: number, itemId: number): Promise<Purchase>;
    getUserPurchases(userId: number, page?: number, limit?: number): Promise<{
        purchases: Purchase[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    adminGetItems(): Promise<ShopItem[]>;
    adminCreateItem(data: Partial<ShopItem>): Promise<ShopItem>;
    adminUpdateItem(id: number, data: Partial<ShopItem>): Promise<ShopItem>;
    adminDeleteItem(id: number): Promise<void>;
}
