import { LikesService } from './likes.service';
import type { Request } from 'express';
export declare class LikesController {
    private readonly likesService;
    constructor(likesService: LikesService);
    likePost(postId: number, req: Request): Promise<{
        message: string;
    }>;
    unlikePost(postId: number, req: Request): Promise<{
        message: string;
    }>;
    checkPostLike(postId: number, userId?: string): Promise<{
        liked: boolean;
        count: number;
    }>;
    getUserLikedPosts(req: Request, page?: string, limit?: string): Promise<{
        posts: import("../../entities").Post[];
        total: number;
    }>;
    likeReply(replyId: number, req: Request): Promise<{
        message: string;
    }>;
    unlikeReply(replyId: number, req: Request): Promise<{
        message: string;
    }>;
    checkReplyLike(replyId: number, userId?: string): Promise<{
        liked: boolean;
        count: number;
    }>;
    getUserReceivedLikeCount(userId: number): Promise<{
        count: number;
    }>;
}
