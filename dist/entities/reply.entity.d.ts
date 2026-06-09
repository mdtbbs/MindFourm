import { Post } from './post.entity';
import { User } from './user.entity';
export declare class Reply {
    id: number;
    post_id: number;
    user_id: number;
    parent_reply_id: number;
    content: string;
    content_html: string;
    status: string;
    like_count: number;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date;
    post: Post;
    user: User;
    parentReply: Reply;
}
