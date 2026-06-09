import { PostTag } from './post-tag.entity';
export declare class Tag {
    id: number;
    name: string;
    slug: string;
    created_at: Date;
    postTags: PostTag[];
}
