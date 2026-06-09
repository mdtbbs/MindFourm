import { User } from './user.entity';
export declare class PointLog {
    id: number;
    user_id: number;
    action: string;
    points_change: number;
    target_type: string;
    target_id: number;
    created_at: Date;
    user: User;
}
