import { User } from './user.entity';
export declare class Ban {
    id: number;
    ban_type: string;
    value: string;
    reason: string;
    is_active: number;
    created_by: number;
    created_at: Date;
    updated_at: Date;
    creator: User;
}
