import { User } from './user.entity';
export declare class Follow {
    id: number;
    follower_id: number;
    following_id: number;
    created_at: Date;
    follower: User;
    following: User;
}
