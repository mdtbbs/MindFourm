import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { LogsService } from '../logs/logs.service';
export declare class UsersController {
    private readonly usersService;
    private readonly logsService;
    constructor(usersService: UsersService, logsService: LogsService);
    getCurrentUser(req: any): Promise<import("../../entities").User & {
        post_count?: number;
        reply_count?: number;
    }>;
    updateProfile(req: any, dto: UpdateProfileDto): Promise<import("../../entities").User>;
    uploadAvatar(req: any, file: Express.Multer.File): Promise<import("../../entities").User>;
    removeAvatar(req: any): Promise<import("../../entities").User>;
    getCurrentUserReplies(req: any, page?: number, limit?: number): Promise<{
        replies: import("../../entities").Reply[];
        total: number;
    }>;
    searchUsers(query?: string, limit?: number): Promise<import("../../entities").User[]>;
    getUserById(id: string): Promise<import("../../entities").User & {
        post_count?: number;
        reply_count?: number;
    }>;
    getUserReplies(id: string, page?: number, limit?: number): Promise<{
        replies: import("../../entities").Reply[];
        total: number;
    }>;
    private logOperation;
    private getClientIp;
}
