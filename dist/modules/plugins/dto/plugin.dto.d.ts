export interface PluginHookDef {
    name: string;
    type?: 'before' | 'after' | 'filter';
    handler: string;
    priority?: number;
}
export declare class PluginMetadata {
    slug: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    dependencies?: string[];
    hooks?: PluginHookDef[];
}
export declare class UpdatePluginConfigDto {
    config: Record<string, any>;
}
