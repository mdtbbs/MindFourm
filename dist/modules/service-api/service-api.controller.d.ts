import { Repository } from 'typeorm';
import { User } from '@entities/user.entity';
import { PostsService } from '../posts/posts.service';
import { RepliesService } from '../replies/replies.service';
import { ServiceCreatePostDto } from './dto/service-create-post.dto';
import { ServiceCreateReplyDto } from './dto/service-create-reply.dto';
export declare class ServiceApiController {
    private userRepository;
    private postsService;
    private repliesService;
    constructor(userRepository: Repository<User>, postsService: PostsService, repliesService: RepliesService);
    createPost(body: ServiceCreatePostDto): Promise<{
        success: boolean;
        user_id: number;
        post_id: number | null;
        status: string | null;
        post: import("../../entities").Post | null;
    }>;
    createReply(postId: number, body: ServiceCreateReplyDto): Promise<{
        success: boolean;
        user_id: number;
        post_id: number;
        reply_id: number;
        status: string;
        reply: import("../../entities").Reply;
    }>;
    private resolveWritableUser;
}
