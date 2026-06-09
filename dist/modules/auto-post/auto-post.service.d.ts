import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { Category } from '@entities/category.entity';
import { Notification } from '@entities/notification.entity';
export declare class AutoPostService {
    private postRepo;
    private categoryRepo;
    private notificationRepo;
    private readonly logger;
    constructor(postRepo: Repository<Post>, categoryRepo: Repository<Category>, notificationRepo: Repository<Notification>);
    createServerAnnouncement(data: {
        server_name: string;
        server_id: number;
        description: string;
        category_slug?: string;
        user_id?: number;
        event_id?: string;
    }): Promise<{
        post: Post;
        created: boolean;
    }>;
}
