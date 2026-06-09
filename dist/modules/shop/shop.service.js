"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const shop_item_entity_1 = require("../../entities/shop-item.entity");
const purchase_entity_1 = require("../../entities/purchase.entity");
const user_entity_1 = require("../../entities/user.entity");
let ShopService = class ShopService {
    constructor(shopItemRepo, purchaseRepo, userRepo, dataSource) {
        this.shopItemRepo = shopItemRepo;
        this.purchaseRepo = purchaseRepo;
        this.userRepo = userRepo;
        this.dataSource = dataSource;
    }
    async getShopItems(page = 1, limit = 20) {
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
    async getItemById(id) {
        const item = await this.shopItemRepo.findOne({ where: { id } });
        if (!item)
            throw new common_1.NotFoundException('商品不存在');
        return item;
    }
    async purchase(userId, itemId) {
        return this.dataSource.transaction(async (manager) => {
            const user = await manager.findOne(user_entity_1.User, {
                where: { id: userId },
                select: ['id', 'available_points'],
            });
            if (!user)
                throw new common_1.NotFoundException('用户不存在');
            const item = await manager.findOne(shop_item_entity_1.ShopItem, { where: { id: itemId } });
            if (!item)
                throw new common_1.NotFoundException('商品不存在');
            if (!item.is_active)
                throw new common_1.BadRequestException('商品已下架');
            if (item.stock <= 0)
                throw new common_1.BadRequestException('商品库存不足');
            if (user.available_points < item.points_cost) {
                throw new common_1.BadRequestException('积分不足，需要 ' + item.points_cost + ' 积分');
            }
            await manager.decrement(user_entity_1.User, { id: userId }, 'available_points', item.points_cost);
            const purchase = manager.create(purchase_entity_1.Purchase, {
                user_id: userId,
                item_id: itemId,
                points_spent: item.points_cost,
                status: 'completed',
            });
            const savedPurchase = await manager.save(purchase_entity_1.Purchase, purchase);
            await manager.decrement(shop_item_entity_1.ShopItem, { id: itemId }, 'stock', 1);
            return savedPurchase;
        });
    }
    async getUserPurchases(userId, page = 1, limit = 20) {
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
    async adminGetItems() {
        return this.shopItemRepo.find({ order: { created_at: 'DESC' } });
    }
    async adminCreateItem(data) {
        const item = this.shopItemRepo.create(data);
        return this.shopItemRepo.save(item);
    }
    async adminUpdateItem(id, data) {
        const item = await this.shopItemRepo.findOne({ where: { id } });
        if (!item)
            throw new common_1.NotFoundException('商品不存在');
        Object.assign(item, data);
        return this.shopItemRepo.save(item);
    }
    async adminDeleteItem(id) {
        const result = await this.shopItemRepo.delete(id);
        if (result.affected === 0)
            throw new common_1.NotFoundException('商品不存在');
    }
};
exports.ShopService = ShopService;
exports.ShopService = ShopService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(shop_item_entity_1.ShopItem)),
    __param(1, (0, typeorm_1.InjectRepository)(purchase_entity_1.Purchase)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], ShopService);
//# sourceMappingURL=shop.service.js.map