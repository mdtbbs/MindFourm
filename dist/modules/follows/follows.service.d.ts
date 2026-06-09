import { Repository, DataSource } from 'typeorm';
import { Follow } from '@entities/follow.entity';
import { User } from '@entities/user.entity';
export declare class FollowsService {
    private followRepo;
    private userRepo;
    private dataSource;
    constructor(followRepo: Repository<Follow>, userRepo: Repository<User>, dataSource: DataSource);
    followUser(followerId: number, followingId: number): Promise<Follow>;
    unfollowUser(followerId: number, followingId: number): Promise<void>;
    checkFollowStatus(followerId: number, followingId: number): Promise<boolean>;
    getFollowers(userId: number, page?: number, limit?: number): Promise<{
        users: User[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getFollowing(userId: number, page?: number, limit?: number): Promise<{
        users: User[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getFollowCounts(userId: number): Promise<{
        followers: number;
        following: number;
    }>;
}
