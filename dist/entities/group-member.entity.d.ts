import { Group } from './group.entity';
import { User } from './user.entity';
export declare class GroupMember {
    id: number;
    group_id: number;
    user_id: number;
    role: string;
    joined_at: Date;
    group: Group;
    user: User;
}
