import { ServiceAccountSelectorDto } from './service-account-selector.dto';
export declare class ServiceCreatePostDto extends ServiceAccountSelectorDto {
    title: string;
    content: string;
    category_id?: number;
    server_id?: number;
    required_group_id?: number;
    post_type?: string;
    tags?: string[];
    status?: string;
}
