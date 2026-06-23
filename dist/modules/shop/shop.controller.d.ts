import { ShopService } from './shop.service';
import { CreateShopItemDto, UpdateShopItemDto, QueryShopDto } from './dto/shop.dto';
import type { Request } from 'express';
export declare class ShopController {
    private readonly shopService;
    constructor(shopService: ShopService);
    getShopItems(query: QueryShopDto): Promise<{
        success: boolean;
        data: {
            items: import("../../entities").ShopItem[];
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    getItemById(id: number): Promise<{
        success: boolean;
        data: import("../../entities").ShopItem;
    }>;
    purchase(itemId: number, req: Request): Promise<{
        success: boolean;
        data: import("../../entities").Purchase;
    }>;
    getMyPurchases(req: Request, query: QueryShopDto): Promise<{
        success: boolean;
        data: {
            purchases: import("../../entities").Purchase[];
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    adminGetItems(): Promise<{
        success: boolean;
        data: import("../../entities").ShopItem[];
    }>;
    adminCreateItem(dto: CreateShopItemDto): Promise<{
        success: boolean;
        data: import("../../entities").ShopItem;
    }>;
    adminUpdateItem(id: number, dto: UpdateShopItemDto): Promise<{
        success: boolean;
        data: import("../../entities").ShopItem;
    }>;
    adminDeleteItem(id: number): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
}
