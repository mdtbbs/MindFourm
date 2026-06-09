import { FollowsService } from './follows.service';
import { QueryFollowsDto, FollowUserDto } from './dto/follow.dto';
export declare class FollowsController {
    private readonly followsService;
    constructor(followsService: FollowsService);
    followUser(followingId: number, dto: FollowUserDto): Promise<{
        success: boolean;
        data: import("../../entities").Follow;
    }>;
    unfollowUser(followingId: number, followerId: number): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    checkFollowStatus(followingId: number, followerId: number): Promise<{
        success: boolean;
        data: {
            isFollowing: boolean;
        };
    }>;
    getFollowers(userId: number, query: QueryFollowsDto): Promise<{
        success: boolean;
        data: {
            users: import("../../entities").User[];
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    getFollowing(userId: number, query: QueryFollowsDto): Promise<{
        success: boolean;
        data: {
            users: import("../../entities").User[];
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    getFollowCounts(userId: number): Promise<{
        success: boolean;
        data: {
            followers: number;
            following: number;
        };
    }>;
}
