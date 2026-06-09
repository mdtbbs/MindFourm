import { User } from './user.entity';
import { Post } from './post.entity';
import { Reply } from './reply.entity';
export declare class Notification {
    id: number;
    user_id: number;
    type: string;
    actor_id: number;
    post_id: number;
    reply_id: number;
    content: string;
    is_read: number;
    created_at: Date;
    user: User;
    actor: User;
    post: Post;
    reply: Reply;
}
