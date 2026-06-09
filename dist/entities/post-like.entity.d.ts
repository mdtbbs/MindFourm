import { User } from './user.entity';
import { Post } from './post.entity';
export declare class PostLike {
    user_id: number;
    post_id: number;
    created_at: Date;
    user: User;
    post: Post;
}
