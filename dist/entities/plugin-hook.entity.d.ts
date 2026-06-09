import { Plugin } from './plugin.entity';
export declare class PluginHook {
    id: number;
    plugin_id: number;
    hook_name: string;
    priority: number;
    is_active: number;
    created_at: Date;
    plugin: Plugin;
}
