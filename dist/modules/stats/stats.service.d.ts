import { Repository } from 'typeorm';
import { Post, Reply, User } from '@entities/index';
import { RedisService } from '../../database/redis.service';
export declare class StatsService {
    private postRepository;
    private replyRepository;
    private userRepository;
    private redisService;
    constructor(postRepository: Repository<Post>, replyRepository: Repository<Reply>, userRepository: Repository<User>, redisService: RedisService);
    getDashboardStats(): Promise<{
        total_posts: number;
        total_replies: number;
        total_users: number;
        posts_today: number;
        replies_today: number;
        active_24h: number;
    }>;
    get7DayActivity(): Promise<Array<{
        date: string;
        count: number;
    }>>;
}
