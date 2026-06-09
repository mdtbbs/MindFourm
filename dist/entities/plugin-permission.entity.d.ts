import { Plugin } from './plugin.entity';
export declare class PluginPermission {
    id: number;
    plugin_id: number;
    permission: string;
    granted: number;
    plugin: Plugin;
}
