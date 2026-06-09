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
exports.ShopController = void 0;
const common_1 = require("@nestjs/common");
const shop_service_1 = require("./shop.service");
const shop_dto_1 = require("./dto/shop.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
let ShopController = class ShopController {
    constructor(shopService) {
        this.shopService = shopService;
    }
    async getShopItems(query) {
        const result = await this.shopService.getShopItems(query.page || 1, query.limit || 20);
        return { success: true, data: result };
    }
    async getItemById(id) {
        const item = await this.shopService.getItemById(id);
        return { success: true, data: item };
    }
    async purchase(itemId, userId) {
        const purchase = await this.shopService.purchase(userId, itemId);
        return { success: true, data: purchase };
    }
    async getMyPurchases(userId, query) {
        const result = await this.shopService.getUserPurchases(userId, query.page || 1, query.limit || 20);
        return { success: true, data: result };
    }
    async adminGetItems() {
        const items = await this.shopService.adminGetItems();
        return { success: true, data: items };
    }
    async adminCreateItem(dto) {
        const item = await this.shopService.adminCreateItem(dto);
        return { success: true, data: item };
    }
    async adminUpdateItem(id, dto) {
        const item = await this.shopService.adminUpdateItem(id, dto);
        return { success: true, data: item };
    }
    async adminDeleteItem(id) {
        await this.shopService.adminDeleteItem(id);
        return { success: true, data: { message: '商品已删除' } };
    }
};
exports.ShopController = ShopController;
__decorate([
    (0, common_1.Get)('items'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [shop_dto_1.QueryShopDto]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "getShopItems", null);
__decorate([
    (0, common_1.Get)('items/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "getItemById", null);
__decorate([
    (0, common_1.Post)('purchase/:itemId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('itemId')),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "purchase", null);
__decorate([
    (0, common_1.Get)('me/purchases'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Query)('userId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, shop_dto_1.QueryShopDto]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "getMyPurchases", null);
__decorate([
    (0, common_1.Get)('admin/items'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "adminGetItems", null);
__decorate([
    (0, common_1.Post)('admin/items'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [shop_dto_1.CreateShopItemDto]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "adminCreateItem", null);
__decorate([
    (0, common_1.Put)('admin/items/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, shop_dto_1.UpdateShopItemDto]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "adminUpdateItem", null);
__decorate([
    (0, common_1.Delete)('admin/items/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], ShopController.prototype, "adminDeleteItem", null);
exports.ShopController = ShopController = __decorate([
    (0, common_1.Controller)('shop'),
    __metadata("design:paramtypes", [shop_service_1.ShopService])
], ShopController);
//# sourceMappingURL=shop.controller.js.map