export declare class Plugin {
    id: number;
    slug: string;
    name: string;
    version: string;
    description: string;
    author: string;
    is_installed: number;
    is_active: number;
    config: string;
    dependencies: string;
    created_at: Date;
    updated_at: Date;
}
