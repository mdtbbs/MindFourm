import { GroupChat } from './group-chat.entity';
import { User } from './user.entity';
export declare class GroupChatMember {
    id: number;
    group_chat_id: number;
    user_id: number;
    role: string;
    joined_at: Date;
    groupChat: GroupChat;
    user: User;
}
