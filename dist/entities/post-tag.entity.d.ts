import { Post } from './post.entity';
import { Tag } from './tag.entity';
export declare class PostTag {
    post_id: number;
    tag_id: number;
    post: Post;
    tag: Tag;
}
