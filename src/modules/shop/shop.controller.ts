import {
  Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, Req,
} from '@nestjs/common';
import { ShopService } from './shop.service';
import { CreateShopItemDto, UpdateShopItemDto, QueryShopDto } from './dto/shop.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import type { Request } from 'express';

/**
 * Reshape the service's `{ items, total, page, limit, totalPages }` into the
 * `{ data, pagination }` envelope every other list endpoint returns.
 *
 * The mismatch was not cosmetic: the shop page read `res.data` and called `.filter()`
 * on it, which threw because the payload carried `items` instead — and the throw landed
 * in an empty catch, so the shop rendered as permanently empty rather than as broken.
 */
function toPaginatedResponse<T>(result: {
  /** The service names this list `items` for shop items and `purchases` for purchases. */
  items?: T[];
  purchases?: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}) {
  return {
    data: result.items ?? result.purchases ?? [],
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      // All four keys: the web client's normaliser reports "no data" when any is absent.
      totalPages: Math.max(1, result.totalPages),
    },
  };
}

@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  // === Public endpoints ===

  @Get('items')
  async getShopItems(@Query() query: QueryShopDto) {
    const result = await this.shopService.getShopItems(query.page || 1, query.limit || 20);
    return toPaginatedResponse(result);
  }

  @Get('items/:id')
  async getItemById(@Param('id') id: number) {
    const item = await this.shopService.getItemById(id);
    return item;
  }

  @Post('purchase/:itemId')
  @UseGuards(JwtAuthGuard)
  async purchase(@Param('itemId') itemId: number, @Req() req: Request) {
    const userId = (req as any).user?.id;
    const purchase = await this.shopService.purchase(userId, itemId);
    return purchase;
  }

  @Get('me/purchases')
  @UseGuards(JwtAuthGuard)
  async getMyPurchases(@Req() req: Request, @Query() query: QueryShopDto) {
    const userId = (req as any).user?.id;
    const result = await this.shopService.getUserPurchases(userId, query.page || 1, query.limit || 20);
    return toPaginatedResponse(result);
  }

  // === Admin endpoints ===

  @Get('admin/items')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminGetItems() {
    const items = await this.shopService.adminGetItems();
    return items;
  }

  @Post('admin/items')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminCreateItem(@Body() dto: CreateShopItemDto) {
    const item = await this.shopService.adminCreateItem(dto);
    return item;
  }

  @Put('admin/items/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminUpdateItem(@Param('id') id: number, @Body() dto: UpdateShopItemDto) {
    const item = await this.shopService.adminUpdateItem(id, dto);
    return item;
  }

  @Delete('admin/items/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminDeleteItem(@Param('id') id: number) {
    await this.shopService.adminDeleteItem(id);
    return { message: '商品已删除' };
  }
}
