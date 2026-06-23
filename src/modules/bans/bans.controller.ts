import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { BansService } from './bans.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { Request } from 'express';

@Controller('bans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BansController {
  constructor(private readonly bansService: BansService) {}

  /**
   * GET /bans - List all bans (admin only)
   */
  @Get()
  @Roles('admin')
  async getList(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('ban_type') ban_type?: string,
    @Query('is_active') is_active?: number,
  ) {
    return this.bansService.getList({
      page: parseInt(page as any, 10),
      limit: parseInt(limit as any, 10),
      ban_type,
      is_active: is_active !== undefined ? parseInt(is_active as any, 10) : undefined,
    });
  }

  /**
   * POST /bans - Create a new ban (admin only)
   */
  @Post()
  @Roles('admin')
  async create(@Body() dto: { ban_type: string; value: string; reason?: string }, @Req() req: Request) {
    return this.bansService.create({
      ban_type: dto.ban_type,
      value: dto.value,
      reason: dto.reason,
      created_by: (req as any).user?.id,
    });
  }

  /**
   * PUT /bans/:id - Update a ban (admin only)
   */
  @Put(':id')
  @Roles('admin')
  async update(@Param('id', ParseIntPipe) id: number, @Body() updates: { reason?: string; is_active?: number }) {
    return this.bansService.update(id, updates);
  }

  /**
   * DELETE /bans/:id - Deactivate a ban (admin only)
   */
  @Delete(':id')
  @Roles('admin')
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    await this.bansService.deactivate(id);
    return { message: 'Ban deactivated' };
  }
}
