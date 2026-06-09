import { PluginManagerService } from './plugin-manager.service';
import { PluginMetadata, UpdatePluginConfigDto } from './dto/plugin.dto';
export declare class PluginsController {
    private readonly pluginManager;
    constructor(pluginManager: PluginManagerService);
    getPlugins(): Promise<{
        success: boolean;
        data: import("../../entities").Plugin[];
    }>;
    getPlugin(slug: string): Promise<{
        success: boolean;
        data: import("../../entities").Plugin;
    }>;
    installPlugin(metadata: PluginMetadata): Promise<{
        success: boolean;
        data: import("../../entities").Plugin;
    }>;
    uninstallPlugin(slug: string): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    enablePlugin(slug: string): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    disablePlugin(slug: string): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    getConfig(slug: string): Promise<{
        success: boolean;
        data: Record<string, any>;
    }>;
    updateConfig(slug: string, config: UpdatePluginConfigDto): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    getPluginHooks(slug: string): Promise<{
        success: boolean;
        data: import("../../entities").PluginHook[];
    }>;
}
