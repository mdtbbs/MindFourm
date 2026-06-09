import { Repository, DataSource } from 'typeorm';
import { PostLike } from '@entities/post-like.entity';
import { ReplyLike } from '@entities/reply-like.entity';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PointsService } from '../points/points.service';
export declare class LikesService {
    private postLikeRepo;
    private replyLikeRepo;
    private postRepo;
    private replyRepo;
    private notificationsService;
    private pointsService;
    private dataSource;
    constructor(postLikeRepo: Repository<PostLike>, replyLikeRepo: Repository<ReplyLike>, postRepo: Repository<Post>, replyRepo: Repository<Reply>, notificationsService: NotificationsService, pointsService: PointsService, dataSource: DataSource);
    likePost(userId: number, postId: number): Promise<void>;
    unlikePost(userId: number, postId: number): Promise<void>;
    isPostLiked(userId: number, postId: number): Promise<boolean>;
    getPostLikeCount(postId: number): Promise<number>;
    getUserLikedPosts(userId: number, page: number, limit: number): Promise<{
        posts: Post[];
        total: number;
    }>;
    likeReply(userId: number, replyId: number): Promise<void>;
    unlikeReply(userId: number, replyId: number): Promise<void>;
    isReplyLiked(userId: number, replyId: number): Promise<boolean>;
    getReplyLikeCount(replyId: number): Promise<number>;
    getUserReceivedLikeCount(userId: number): Promise<number>;
}
