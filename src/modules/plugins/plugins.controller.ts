import {
  Controller, Get, Post, Put, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import { PluginManagerService } from './plugin-manager.service';
import { PluginMetadata, UpdatePluginConfigDto } from './dto/plugin.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

@Controller('plugins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PluginsController {
  constructor(private readonly pluginManager: PluginManagerService) {}

  @Get()
  async getPlugins() {
    const plugins = await this.pluginManager.getPlugins();
    return { success: true, data: plugins };
  }

  @Get(':slug')
  async getPlugin(@Param('slug') slug: string) {
    const plugin = await this.pluginManager.getPlugin(slug);
    return { success: true, data: plugin };
  }

  @Post('install')
  async installPlugin(@Body() metadata: PluginMetadata) {
    const plugin = await this.pluginManager.install(metadata);
    return { success: true, data: plugin };
  }

  @Delete(':slug')
  async uninstallPlugin(@Param('slug') slug: string) {
    await this.pluginManager.uninstall(slug);
    return { success: true, data: { message: '插件已卸载' } };
  }

  @Post(':slug/enable')
  async enablePlugin(@Param('slug') slug: string) {
    await this.pluginManager.enable(slug);
    return { success: true, data: { message: '插件已启用' } };
  }

  @Post(':slug/disable')
  async disablePlugin(@Param('slug') slug: string) {
    await this.pluginManager.disable(slug);
    return { success: true, data: { message: '插件已禁用' } };
  }

  @Get(':slug/config')
  async getConfig(@Param('slug') slug: string) {
    const config = await this.pluginManager.getConfig(slug);
    return { success: true, data: config };
  }

  @Put(':slug/config')
  async updateConfig(@Param('slug') slug: string, @Body() config: UpdatePluginConfigDto) {
    await this.pluginManager.configure(slug, config.config);
    return { success: true, data: { message: '配置已更新' } };
  }

  @Get(':slug/hooks')
  async getPluginHooks(@Param('slug') slug: string) {
    const hooks = await this.pluginManager.getPluginHooks(slug);
    return { success: true, data: hooks };
  }
}
