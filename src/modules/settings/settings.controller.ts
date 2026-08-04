import { Controller, Get, Param, UseGuards, Put, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsRevalidationService } from './settings-revalidation.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { Public } from '@common/decorators/public.decorator';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly settingsRevalidationService: SettingsRevalidationService,
  ) {}

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
    const touchesPublicSettings = this.settingsService.hasPublicKeys(Object.keys(data));
    await this.settingsService.setBatch(category, data);
    if (touchesPublicSettings) {
      await this.settingsRevalidationService.revalidatePublicSettings();
    }
    return { message: 'Settings updated' };
  }
}
