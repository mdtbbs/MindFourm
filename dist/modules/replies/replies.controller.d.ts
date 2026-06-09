import { RepliesService } from './replies.service';
import { CreateReplyDto } from './dto/create-reply.dto';
import { UpdateReplyDto } from './dto/update-reply.dto';
export declare class RepliesController {
    private readonly repliesService;
    constructor(repliesService: RepliesService);
    getRepliesByPost(postId: number, page?: number, limit?: number): Promise<{
        data: import("../../entities").Reply[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    createReply(postId: number, dto: CreateReplyDto, req: any): Promise<import("../../entities").Reply>;
}
export declare class RepliesControllerMain {
    private readonly repliesService;
    constructor(repliesService: RepliesService);
    getReplyById(id: number): Promise<import("../../entities").Reply>;
    updateReply(id: number, dto: UpdateReplyDto, req: any): Promise<import("../../entities").Reply>;
    deleteReply(id: number, req: any): Promise<{
        message: string;
    }>;
}
