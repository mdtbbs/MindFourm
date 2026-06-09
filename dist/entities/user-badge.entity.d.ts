import { User } from './user.entity';
import { Badge } from './badge.entity';
export declare class UserBadge {
    id: number;
    user_id: number;
    badge_id: number;
    granted_by: number;
    granted_at: Date;
    user: User;
    badge: Badge;
    granter: User;
}
