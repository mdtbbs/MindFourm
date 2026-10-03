import { Controller, Get, Param, UseGuards, Put, Body, BadRequestException, Optional, Req } from '@nestjs/common';
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
import { LogsService } from '../logs/logs.service';
import { getClientIp } from '@common/utils/client-context.util';
import { createSettingsAuditDetails } from '@common/utils/settings-audit.util';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly settingsRevalidationService: SettingsRevalidationService,
    @Optional() private readonly logsService?: LogsService,
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
  async updateSidebarNavigation(@Body() dto: UpdateSidebarNavigationDto, @Req() req?: any) {
    const validation = validateSidebarNavigation(dto.items);
    if (!validation.valid) {
      throw new BadRequestException(validation.errors);
    }

    const home = getDefaultSidebarNavigation().find((item) => item.id === 'home');
    const items = home && !dto.items.some((item) => item.id === home.id)
      ? [home, ...dto.items]
      : dto.items.map((item) => item.id === home?.id ? { ...item, enabled: true } : item);

    const before = await this.readAuditBaseline('navigation');
    await this.settingsService.updateSetting(
      'sidebar_navigation_items',
      JSON.stringify(items),
    );

    await this.settingsRevalidationService.revalidatePublicSettings();
    await this.auditSettingsUpdate(req, 'navigation', before, { sidebar_navigation_items: JSON.stringify(items) });

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
  async updateBrandSettings(@Body() dto: UpdateBrandSettingsDto, @Req() req?: any) {
    const touchesPublicSettings = this.settingsService.hasPublicKeys(Object.keys(dto));
    const before = await this.readAuditBaseline('brand');
    await this.settingsService.setBatch('brand', dto as Record<string, string>);
    if (touchesPublicSettings) {
      await this.settingsRevalidationService.revalidatePublicSettings();
    }
    await this.auditSettingsUpdate(req, 'brand', before, dto as Record<string, unknown>);
    return { message: 'Settings updated' };
  }

  @Put(':category')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateSettings(@Param('category') category: string, @Body() data: Record<string, string>, @Req() req?: any) {
    const touchesPublicSettings = this.settingsService.hasPublicKeys(Object.keys(data));
    const before = await this.readAuditBaseline(category);
    await this.settingsService.setBatch(category, data);
    if (touchesPublicSettings) {
      await this.settingsRevalidationService.revalidatePublicSettings();
    }
    await this.auditSettingsUpdate(req, category, before, data);
    return { message: 'Settings updated' };
  }

  private async readAuditBaseline(category: string): Promise<Record<string, string>> {
    return this.logsService ? this.settingsService.getByCategoryForAdmin(category) : {};
  }

  private async auditSettingsUpdate(
    req: any,
    category: string,
    before: Record<string, string>,
    updates: Record<string, unknown>,
  ): Promise<void> {
    if (!this.logsService) return;
    const after = await this.settingsService.getByCategoryForAdmin(category);
    const applied = Object.fromEntries(Object.keys(updates).map((key) => [key, after[key] ?? String(updates[key] ?? '')]));
    await this.logsService.log({
      user_id: req?.user?.id,
      action: 'settings.update',
      target_type: 'setting',
      details: JSON.stringify(createSettingsAuditDetails(category, before, applied, req?.requestId)),
      ip_address: req ? getClientIp(req) : undefined,
      user_agent: req?.headers?.['user-agent'],
    }).catch((error) => console.warn('settings operation log failed:', error instanceof Error ? error.message : String(error)));
  }
}
