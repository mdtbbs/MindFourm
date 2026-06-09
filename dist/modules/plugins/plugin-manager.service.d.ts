import { Repository } from 'typeorm';
import { Plugin } from '@entities/plugin.entity';
import { PluginHook } from '@entities/plugin-hook.entity';
import { PluginConfig } from '@entities/plugin-config.entity';
import { PluginPermission } from '@entities/plugin-permission.entity';
import { EventBusService } from './event-bus.service';
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
        handler: string;
    }[];
}
export declare class PluginManagerService {
    private pluginRepo;
    private pluginHookRepo;
    private pluginConfigRepo;
    private pluginPermissionRepo;
    private eventBus;
    private readonly logger;
    private readonly pluginsDir;
    private loadedPlugins;
    constructor(pluginRepo: Repository<Plugin>, pluginHookRepo: Repository<PluginHook>, pluginConfigRepo: Repository<PluginConfig>, pluginPermissionRepo: Repository<PluginPermission>, eventBus: EventBusService);
    loadPlugins(): Promise<void>;
    private loadPlugin;
    install(metadata: PluginMetadata): Promise<Plugin>;
    uninstall(slug: string): Promise<void>;
    enable(slug: string): Promise<void>;
    disable(slug: string): Promise<void>;
    configure(slug: string, config: Record<string, any>): Promise<void>;
    getConfig(slug: string): Promise<Record<string, any>>;
    getPlugins(): Promise<Plugin[]>;
    getPlugin(slug: string): Promise<Plugin>;
    getPluginHooks(slug: string): Promise<PluginHook[]>;
    getPluginConfigs(slug: string): Promise<PluginConfig[]>;
    executeHook<T>(hookName: string, context: T): Promise<T>;
}
