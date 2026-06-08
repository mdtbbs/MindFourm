import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { LevelsService } from './levels.service';
import { CreateLevelDto, UpdateLevelDto } from './dto/level.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

@Controller('levels')
export class LevelsController {
  constructor(private readonly levelsService: LevelsService) {}

  @Get()
  async getAllLevels() {
    const levels = await this.levelsService.getAllLevels();
    return { success: true, data: levels };
  }

  @Get('user/:userId')
  async getUserLevel(@Param('userId') userId: number) {
    const info = await this.levelsService.getUserLevelInfo(userId);
    return { success: true, data: info };
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getAdminLevels() {
    const levels = await this.levelsService.getAllLevels();
    return { success: true, data: levels };
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createLevel(@Body() dto: CreateLevelDto) {
    const level = await this.levelsService.createLevel(dto);
    return { success: true, data: level };
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateLevel(@Param('id') id: number, @Body() dto: UpdateLevelDto) {
    const level = await this.levelsService.updateLevel(id, dto);
    return { success: true, data: level };
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteLevel(@Param('id') id: number) {
    await this.levelsService.deleteLevel(id);
    return { success: true, data: { message: '等级已删除' } };
  }
}
