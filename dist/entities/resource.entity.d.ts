import { User } from './user.entity';
import { ResourceCategory } from './resource-category.entity';
export declare class Resource {
    id: number;
    user_id: number;
    title: string;
    description: string;
    resource_type: string;
    file_name: string;
    file_path: string;
    file_size: number;
    mime_type: string;
    external_url: string;
    version: string;
    content: string;
    content_html: string;
    category_id: number;
    is_public: number;
    status: string;
    download_count: number;
    created_at: Date;
    updated_at: Date;
    user: User;
    category: ResourceCategory;
}
