import { Repository, DataSource } from 'typeorm';
import { PointLog } from '@entities/point-log.entity';
import { PointRule } from '@entities/point-rule.entity';
import { User } from '@entities/user.entity';
import { CreatePointRuleDto, UpdatePointRuleDto } from './dto/admin-points.dto';
export declare class PointsService {
    private pointLogRepo;
    private pointRuleRepo;
    private userRepo;
    private dataSource;
    constructor(pointLogRepo: Repository<PointLog>, pointRuleRepo: Repository<PointRule>, userRepo: Repository<User>, dataSource: DataSource);
    awardPoints(userId: number, action: string, targetType?: string, targetId?: number): Promise<PointLog | null>;
    deductPoints(userId: number, amount: number, reason: string): Promise<PointLog>;
    awardPointsManual(userId: number, amount: number, reason: string): Promise<PointLog>;
    getUserPoints(userId: number): Promise<{
        total_points: number;
        available_points: number;
    }>;
    getHistory(userId: number, limit?: number, cursor?: string): Promise<{
        logs: PointLog[];
        nextCursor: string | null;
    }>;
    getLeaderboard(limit?: number, page?: number): Promise<{
        users: any[];
        total: number;
    }>;
    getRules(): Promise<PointRule[]>;
    createRule(dto: CreatePointRuleDto): Promise<PointRule>;
    updateRule(id: number, dto: UpdatePointRuleDto): Promise<PointRule>;
    deleteRule(id: number): Promise<void>;
    initializeDefaultRules(): Promise<void>;
}
