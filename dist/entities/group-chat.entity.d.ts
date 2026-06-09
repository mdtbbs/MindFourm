import { User } from './user.entity';
import { GroupChatMember } from './group-chat-member.entity';
export declare class GroupChat {
    id: number;
    name: string;
    creator_id: number;
    description: string;
    created_at: Date;
    creator: User;
    members: GroupChatMember[];
}
