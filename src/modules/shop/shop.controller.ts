import {
  Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { ShopService } from './shop.service';
import { CreateShopItemDto, UpdateShopItemDto, QueryShopDto } from './dto/shop.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  // === Public endpoints ===

  @Get('items')
  async getShopItems(@Query() query: QueryShopDto) {
    const result = await this.shopService.getShopItems(query.page || 1, query.limit || 20);
    return { success: true, data: result };
  }

  @Get('items/:id')
  async getItemById(@Param('id') id: number) {
    const item = await this.shopService.getItemById(id);
    return { success: true, data: item };
  }

  @Post('purchase/:itemId')
  @UseGuards(JwtAuthGuard)
  async purchase(@Param('itemId') itemId: number, @Query('userId') userId: number) {
    const purchase = await this.shopService.purchase(userId, itemId);
    return { success: true, data: purchase };
  }

  @Get('me/purchases')
  @UseGuards(JwtAuthGuard)
  async getMyPurchases(@Query('userId') userId: number, @Query() query: QueryShopDto) {
    const result = await this.shopService.getUserPurchases(userId, query.page || 1, query.limit || 20);
    return { success: true, data: result };
  }

  // === Admin endpoints ===

  @Get('admin/items')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminGetItems() {
    const items = await this.shopService.adminGetItems();
    return { success: true, data: items };
  }

  @Post('admin/items')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminCreateItem(@Body() dto: CreateShopItemDto) {
    const item = await this.shopService.adminCreateItem(dto);
    return { success: true, data: item };
  }

  @Put('admin/items/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminUpdateItem(@Param('id') id: number, @Body() dto: UpdateShopItemDto) {
    const item = await this.shopService.adminUpdateItem(id, dto);
    return { success: true, data: item };
  }

  @Delete('admin/items/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminDeleteItem(@Param('id') id: number) {
    await this.shopService.adminDeleteItem(id);
    return { success: true, data: { message: '商品已删除' } };
  }
}
