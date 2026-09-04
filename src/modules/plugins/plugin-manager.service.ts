import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { Plugin } from '@entities/plugin.entity';
import { PluginHook } from '@entities/plugin-hook.entity';
import { PluginConfig } from '@entities/plugin-config.entity';
import { PluginPermission } from '@entities/plugin-permission.entity';
import { EventBusService, HookFn } from './event-bus.service';

export interface PluginMetadata {
  slug: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: string[];
  hooks?: {
    name: string;
    priority?: number;
    handler: string; // function name in index.js
  }[];
}

@Injectable()
export class PluginManagerService {
  private readonly logger = new Logger(PluginManagerService.name);
  private readonly pluginsDir = path.join(process.cwd(), 'plugins');
  private loadedPlugins = new Map<string, any>(); // plugin instances

  constructor(
    @InjectRepository(Plugin)
    private pluginRepo: Repository<Plugin>,
    @InjectRepository(PluginHook)
    private pluginHookRepo: Repository<PluginHook>,
    @InjectRepository(PluginConfig)
    private pluginConfigRepo: Repository<PluginConfig>,
    @InjectRepository(PluginPermission)
    private pluginPermissionRepo: Repository<PluginPermission>,
    private eventBus: EventBusService,
  ) {}

  /**
   * Load all active plugins on startup
   */
  async loadPlugins(): Promise<void> {
    const activePlugins = await this.pluginRepo.find({ where: { is_active: 1, is_installed: 1 } });
    this.logger.log(`Loading ${activePlugins.length} active plugins...`);

    for (const plugin of activePlugins) {
      try {
        await this.loadPlugin(plugin);
      } catch (error) {
        this.logger.error(`Failed to load plugin ${plugin.slug}:`, error);
      }
    }

    this.logger.log(`Successfully loaded ${this.loadedPlugins.size} plugins`);
  }

  /**
   * Load a single plugin
   */
  private async loadPlugin(plugin: Plugin): Promise<void> {
    const pluginDir = this.getPluginDir(plugin.slug);

    // Check if plugin directory exists
    if (!fs.existsSync(pluginDir)) {
      this.logger.warn(`Plugin directory not found: ${pluginDir}`);
      return;
    }

    const indexPath = path.join(pluginDir, 'index.js');
    if (!fs.existsSync(indexPath)) {
      this.logger.warn(`Plugin index.js not found: ${indexPath}`);
      return;
    }

    // Dynamic require
    const pluginModule = require(indexPath);

    if (typeof pluginModule.init !== 'function') {
      this.logger.warn(`Plugin ${plugin.slug} does not export an init() function`);
      return;
    }

    // Parse config
    const config = plugin.config ? JSON.parse(plugin.config) : {};

    // Initialize plugin
    const instance = await pluginModule.init({
      slug: plugin.slug,
      config,
      eventBus: this.eventBus,
    });

    this.loadedPlugins.set(plugin.slug, instance);

    // Register hooks from database
    const hooks = await this.pluginHookRepo.find({
      where: { plugin_id: plugin.id, is_active: 1 },
      order: { priority: 'ASC' },
    });

    for (const hook of hooks) {
      const hookFn = instance[hook.hook_name];
      if (typeof hookFn === 'function') {
        this.eventBus.register(hook.hook_name, plugin.slug, hookFn, hook.priority);
      }
    }

    this.logger.log(`Plugin loaded: ${plugin.name} v${plugin.version}`);
  }

  /**
   * Install a plugin from metadata
   */
  async install(metadata: PluginMetadata): Promise<Plugin> {
    const existing = await this.pluginRepo.findOne({ where: { slug: metadata.slug } });
    if (existing) throw new BadRequestException('插件已安装');

    // Check dependencies
    if (metadata.dependencies && metadata.dependencies.length > 0) {
      for (const dep of metadata.dependencies) {
        const depPlugin = await this.pluginRepo.findOne({ where: { slug: dep } });
        if (!depPlugin) {
          throw new BadRequestException(`缺少依赖: ${dep}`);
        }
      }
    }

    // Create plugin directory
    const pluginDir = this.getPluginDir(metadata.slug);
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }
    if (!fs.existsSync(pluginDir)) {
      fs.mkdirSync(pluginDir, { recursive: true });
    }

    const plugin = this.pluginRepo.create({
      slug: metadata.slug,
      name: metadata.name,
      version: metadata.version,
      description: metadata.description,
      author: metadata.author,
      is_installed: 1,
      is_active: 0,
      config: JSON.stringify({}),
      dependencies: metadata.dependencies ? JSON.stringify(metadata.dependencies) : undefined as any,
    });

    const saved = await this.pluginRepo.save([plugin]).then(r => r[0]);

    // Create default hook records
    if (metadata.hooks) {
      for (const hook of metadata.hooks) {
        const pluginHook = this.pluginHookRepo.create({
          plugin_id: saved.id,
          hook_name: hook.name,
          priority: hook.priority || 0,
          is_active: 1,
        });
        await this.pluginHookRepo.save(pluginHook);
      }
    }

    this.logger.log(`Plugin installed: ${metadata.name} v${metadata.version}`);
    return saved;
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(slug: string): Promise<void> {
    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('插件不存在');

    // Unload if active
    if (this.loadedPlugins.has(slug)) {
      this.eventBus.unregister(slug);
      this.loadedPlugins.delete(slug);
    }

    // Delete from database
    await this.pluginHookRepo.delete({ plugin_id: plugin.id });
    await this.pluginConfigRepo.delete({ plugin_id: plugin.id });
    await this.pluginPermissionRepo.delete({ plugin_id: plugin.id });
    await this.pluginRepo.delete(plugin.id);

    // Delete plugin directory
    const pluginDir = this.getPluginDir(slug);
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }

    this.logger.log(`Plugin uninstalled: ${slug}`);
  }

  /**
   * Enable a plugin
   */
  async enable(slug: string): Promise<void> {
    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('插件不存在');
    if (plugin.is_active) throw new BadRequestException('插件已启用');

    plugin.is_active = 1;
    await this.pluginRepo.save(plugin);

    // Load the plugin
    await this.loadPlugin(plugin);

    this.logger.log(`Plugin enabled: ${slug}`);
  }

  /**
   * Disable a plugin
   */
  async disable(slug: string): Promise<void> {
    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('插件不存在');
    if (!plugin.is_active) throw new BadRequestException('插件已禁用');

    // Unregister hooks
    this.eventBus.unregister(slug);
    this.loadedPlugins.delete(slug);

    plugin.is_active = 0;
    await this.pluginRepo.save(plugin);

    this.logger.log(`Plugin disabled: ${slug}`);
  }

  /**
   * Update plugin configuration
   */
  async configure(slug: string, config: Record<string, any>): Promise<void> {
    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('插件不存在');

    plugin.config = JSON.stringify(config);
    await this.pluginRepo.save(plugin);
  }

  /**
   * Get plugin configuration
   */
  async getConfig(slug: string): Promise<Record<string, any>> {
    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('插件不存在');
    return plugin.config ? JSON.parse(plugin.config) : {};
  }

  // === Query methods ===

  async getPlugins(): Promise<Plugin[]> {
    return this.pluginRepo.find({ order: { created_at: 'DESC' } });
  }

  async getPlugin(slug: string): Promise<Plugin> {
    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('插件不存在');
    return plugin;
  }

  async getPluginHooks(slug: string): Promise<PluginHook[]> {
    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('插件不存在');
    return this.pluginHookRepo.find({ where: { plugin_id: plugin.id } });
  }

  async getPluginConfigs(slug: string): Promise<PluginConfig[]> {
    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('插件不存在');
    return this.pluginConfigRepo.find({ where: { plugin_id: plugin.id } });
  }

  /**
   * Execute a hook (public interface for other services to use)
   */
  async executeHook<T>(hookName: string, context: T): Promise<T> {
    return this.eventBus.execute(hookName, context);
  }

  private getPluginDir(slug: string): string {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(slug)) {
      throw new BadRequestException('Invalid plugin slug');
    }

    const root = path.resolve(this.pluginsDir);
    const pluginDir = path.resolve(root, slug);
    if (pluginDir !== root && pluginDir.startsWith(`${root}${path.sep}`)) {
      return pluginDir;
    }

    throw new BadRequestException('Invalid plugin path');
  }
}
