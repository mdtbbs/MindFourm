import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
export declare class PostServersService {
    private postRepo;
    private userRepo;
    constructor(postRepo: Repository<Post>, userRepo: Repository<User>);
    getPostsByServer(serverId: number): Promise<Post[]>;
    getForumPostsByServer(serverId: number): Promise<{
        id: number;
        title: string;
        post_type: string;
        status: string;
        created_at: Date;
        user: {
            username: string;
        };
        category: {
            name: string;
            slug: string;
        };
    }[]>;
    linkPostToServer(postId: number, serverId: number, userId: number): Promise<{
        success: boolean;
        post_id: number;
        server_id: number;
    }>;
    unlinkPostFromServer(postId: number, userId: number): Promise<{
        success: boolean;
        post_id: number;
    }>;
}
