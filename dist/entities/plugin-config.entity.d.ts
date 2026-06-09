import { Plugin } from './plugin.entity';
export declare class PluginConfig {
    id: number;
    plugin_id: number;
    key: string;
    value: string;
    type: string;
    description: string;
    plugin: Plugin;
}
