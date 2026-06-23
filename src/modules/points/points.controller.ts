import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PointsService } from './points.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { QueryPointHistoryDto } from './dto/point-history.dto';
import { QueryLeaderboardDto } from './dto/leaderboard.dto';
import { AwardPointsDto, CreatePointRuleDto, UpdatePointRuleDto } from './dto/admin-points.dto';
import type { Request } from 'express';

@Controller('points')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyPoints(@Req() req: Request) {
    const userId = (req as any).user?.id;
    const points = await this.pointsService.getUserPoints(userId);
    return { success: true, data: points };
  }

  @Get('me/history')
  @UseGuards(JwtAuthGuard)
  async getMyHistory(
    @Req() req: Request,
    @Query() query: QueryPointHistoryDto,
  ) {
    const userId = (req as any).user?.id;
    const result = await this.pointsService.getHistory(
      userId,
      query.limit || 20,
      query.cursor,
    );
    return { success: true, data: result };
  }

  @Get('leaderboard')
  async getLeaderboard(@Query() query: QueryLeaderboardDto) {
    const result = await this.pointsService.getLeaderboard(
      query.limit || 20,
      query.page || 1,
    );
    return { success: true, data: result };
  }

  @Get('rules')
  async getRules() {
    const rules = await this.pointsService.getRules();
    return { success: true, data: rules };
  }

  // Admin endpoints
  @Get('admin/rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getAdminRules() {
    const rules = await this.pointsService.getRules();
    return { success: true, data: rules };
  }

  @Post('admin/rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createRule(@Body() dto: CreatePointRuleDto) {
    const rule = await this.pointsService.createRule(dto);
    return { success: true, data: rule };
  }

  @Put('admin/rules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateRule(@Param('id') id: number, @Body() dto: UpdatePointRuleDto) {
    const rule = await this.pointsService.updateRule(id, dto);
    return { success: true, data: rule };
  }

  @Delete('admin/rules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteRule(@Param('id') id: number) {
    await this.pointsService.deleteRule(id);
    return { success: true, data: { message: '规则已删除' } };
  }

  @Post('admin/award')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async awardPoints(@Body() dto: AwardPointsDto) {
    const log = await this.pointsService.awardPointsManual(dto.user_id, dto.points, dto.reason);
    return { success: true, data: log };
  }
}
