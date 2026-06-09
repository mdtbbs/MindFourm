import { PointsService } from './points.service';
import { QueryPointHistoryDto } from './dto/point-history.dto';
import { QueryLeaderboardDto } from './dto/leaderboard.dto';
import { AwardPointsDto, CreatePointRuleDto, UpdatePointRuleDto } from './dto/admin-points.dto';
export declare class PointsController {
    private readonly pointsService;
    constructor(pointsService: PointsService);
    getMyPoints(userId: number): Promise<{
        success: boolean;
        data: {
            total_points: number;
            available_points: number;
        };
    }>;
    getMyHistory(userId: number, query: QueryPointHistoryDto): Promise<{
        success: boolean;
        data: {
            logs: import("../../entities").PointLog[];
            nextCursor: string | null;
        };
    }>;
    getLeaderboard(query: QueryLeaderboardDto): Promise<{
        success: boolean;
        data: {
            users: any[];
            total: number;
        };
    }>;
    getRules(): Promise<{
        success: boolean;
        data: import("../../entities").PointRule[];
    }>;
    getAdminRules(): Promise<{
        success: boolean;
        data: import("../../entities").PointRule[];
    }>;
    createRule(dto: CreatePointRuleDto): Promise<{
        success: boolean;
        data: import("../../entities").PointRule;
    }>;
    updateRule(id: number, dto: UpdatePointRuleDto): Promise<{
        success: boolean;
        data: import("../../entities").PointRule;
    }>;
    deleteRule(id: number): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    awardPoints(dto: AwardPointsDto): Promise<{
        success: boolean;
        data: import("../../entities").PointLog;
    }>;
}
