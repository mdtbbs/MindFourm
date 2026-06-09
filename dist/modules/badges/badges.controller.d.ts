import { BadgesService } from './badges.service';
import { CreateBadgeDto, UpdateBadgeDto, AwardBadgeDto } from './dto/badge.dto';
export declare class BadgesController {
    private readonly badgesService;
    constructor(badgesService: BadgesService);
    getAllBadges(): Promise<{
        success: boolean;
        data: import("../../entities").Badge[];
    }>;
    getUserBadges(userId: number): Promise<{
        success: boolean;
        data: import("../../entities").UserBadge[];
    }>;
    adminGetAllBadges(): Promise<{
        success: boolean;
        data: import("../../entities").Badge[];
    }>;
    adminCreateBadge(dto: CreateBadgeDto): Promise<{
        success: boolean;
        data: import("../../entities").Badge;
    }>;
    adminUpdateBadge(id: number, dto: UpdateBadgeDto): Promise<{
        success: boolean;
        data: import("../../entities").Badge;
    }>;
    adminDeleteBadge(id: number): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    awardBadge(dto: AwardBadgeDto): Promise<{
        success: boolean;
        data: import("../../entities").UserBadge;
    }>;
}
