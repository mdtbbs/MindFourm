import { Repository } from 'typeorm';
import { Badge } from '@entities/badge.entity';
import { UserBadge } from '@entities/user-badge.entity';
import { User } from '@entities/user.entity';
export declare class BadgesService {
    private badgeRepo;
    private userBadgeRepo;
    private userRepo;
    constructor(badgeRepo: Repository<Badge>, userBadgeRepo: Repository<UserBadge>, userRepo: Repository<User>);
    getAllBadges(): Promise<Badge[]>;
    getUserBadges(userId: number): Promise<UserBadge[]>;
    awardBadge(userId: number, badgeId: number, grantedBy?: number): Promise<UserBadge>;
    removeUserBadge(userId: number, badgeId: number): Promise<void>;
    adminGetAllBadges(): Promise<Badge[]>;
    adminCreateBadge(data: Partial<Badge>): Promise<Badge>;
    adminUpdateBadge(id: number, data: Partial<Badge>): Promise<Badge>;
    adminDeleteBadge(id: number): Promise<void>;
    initializeDefaultBadges(): Promise<void>;
}
