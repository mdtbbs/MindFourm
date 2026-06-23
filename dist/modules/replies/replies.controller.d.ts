import { RepliesService } from './replies.service';
import { CreateReplyDto } from './dto/create-reply.dto';
import { UpdateReplyDto } from './dto/update-reply.dto';
import { LogsService } from '../logs/logs.service';
export declare class RepliesController {
    private readonly repliesService;
    private readonly logsService;
    constructor(repliesService: RepliesService, logsService: LogsService);
    getRepliesByPost(postId: number, page?: number, limit?: number): Promise<{
        data: import("../../entities").Reply[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    createReply(postId: number, dto: CreateReplyDto, req: any): Promise<import("../../entities").Reply>;
    private logOperation;
    private getClientIp;
}
export declare class RepliesControllerMain {
    private readonly repliesService;
    private readonly logsService;
    constructor(repliesService: RepliesService, logsService: LogsService);
    getReplyById(id: number): Promise<import("../../entities").Reply>;
    updateReply(id: number, dto: UpdateReplyDto, req: any): Promise<import("../../entities").Reply>;
    deleteReply(id: number, req: any): Promise<{
        message: string;
    }>;
    private logOperation;
    private getClientIp;
}
