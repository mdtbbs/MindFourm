import { Controller, Get, Param, UseGuards, Put, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { Public } from '@common/decorators/public.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Public()
  async getAll() {
    return this.settingsService.getPublicSettings();
  }

  @Get(':category')
  @Public()
  async getByCategory(@Param('category') category: string) {
    return this.settingsService.getPublicByCategory(category);
  }

  @Put(':category')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateSettings(@Param('category') category: string, @Body() data: Record<string, string>) {
    await this.settingsService.setBatch(category, data);
    return { message: 'Settings updated' };
  }
}
