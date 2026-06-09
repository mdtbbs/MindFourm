export declare class CreatePostDto {
    title: string;
    content: string;
    category_id?: number;
    server_id?: number;
    required_group_id?: number;
    post_type?: string;
    tags?: string[];
    status?: string;
}
