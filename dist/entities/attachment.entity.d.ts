import { Post } from './post.entity';
export declare class Attachment {
    id: number;
    post_id: number;
    reply_id: number;
    user_id: number;
    file_name: string;
    file_path: string;
    file_size: number;
    mime_type: string;
    download_count: number;
    created_at: Date;
    post: Post;
}
