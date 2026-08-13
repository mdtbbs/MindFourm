import { Controller, Get, Param, UseGuards, Put, Body, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsRevalidationService } from './settings-revalidation.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { Public } from '@common/decorators/public.decorator';
import { UpdateBrandSettingsDto } from './dto/update-brand-settings.dto';
import { UpdateSidebarNavigationDto } from './dto/update-sidebar-navigation.dto';
import { validateSidebarNavigation } from '@common/utils/sidebar-navigation.util';
import { getDefaultSidebarNavigation } from '@common/utils/sidebar-navigation-defaults';

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

  @Get('admin/sidebar-navigation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getSidebarNavigation() {
    return this.settingsService.getSidebarNavigation();
  }

  @Put('admin/sidebar-navigation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateSidebarNavigation(@Body() dto: UpdateSidebarNavigationDto) {
    const validation = validateSidebarNavigation(dto.items);
    if (!validation.valid) {
      throw new BadRequestException(validation.errors);
    }

    const home = getDefaultSidebarNavigation().find((item) => item.id === 'home');
    const items = home && !dto.items.some((item) => item.id === home.id)
      ? [home, ...dto.items]
      : dto.items.map((item) => item.id === home?.id ? { ...item, enabled: true } : item);

    await this.settingsService.updateSetting(
      'sidebar_navigation_items',
      JSON.stringify(items),
    );

    await this.settingsRevalidationService.revalidatePublicSettings();

    return { success: true };
  }

  @Get(':category')
  @Public()
  async getByCategory(@Param('category') category: string) {
    return this.settingsService.getPublicByCategory(category);
  }

  @Put('brand')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateBrandSettings(@Body() dto: UpdateBrandSettingsDto) {
    const touchesPublicSettings = this.settingsService.hasPublicKeys(Object.keys(dto));
    await this.settingsService.setBatch('brand', dto as Record<string, string>);
    if (touchesPublicSettings) {
      await this.settingsRevalidationService.revalidatePublicSettings();
    }
    return { message: 'Settings updated' };
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
