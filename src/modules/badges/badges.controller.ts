import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { BadgesService } from './badges.service';
import { CreateBadgeDto, UpdateBadgeDto, AwardBadgeDto } from './dto/badge.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

@Controller('badges')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  @Get()
  async getAllBadges() {
    const badges = await this.badgesService.getAllBadges();
    return { success: true, data: badges };
  }

  @Get('user/:userId')
  async getUserBadges(@Param('userId') userId: number) {
    const userBadges = await this.badgesService.getUserBadges(userId);
    return { success: true, data: userBadges };
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminGetAllBadges() {
    const badges = await this.badgesService.adminGetAllBadges();
    return { success: true, data: badges };
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminCreateBadge(@Body() dto: CreateBadgeDto) {
    const badge = await this.badgesService.adminCreateBadge(dto);
    return { success: true, data: badge };
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminUpdateBadge(@Param('id') id: number, @Body() dto: UpdateBadgeDto) {
    const badge = await this.badgesService.adminUpdateBadge(id, dto);
    return { success: true, data: badge };
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async adminDeleteBadge(@Param('id') id: number) {
    await this.badgesService.adminDeleteBadge(id);
    return { success: true, data: { message: '徽章已删除' } };
  }

  @Post('admin/award')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async awardBadge(@Body() dto: AwardBadgeDto) {
    const userBadge = await this.badgesService.awardBadge(dto.user_id, dto.badge_id);
    return { success: true, data: userBadge };
  }
}
