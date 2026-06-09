import { User } from './user.entity';
import { GroupChat } from './group-chat.entity';
export declare class Message {
    id: number;
    sender_id: number;
    recipient_id: number;
    group_chat_id: number;
    content: string;
    content_html: string;
    is_read: number;
    read_at: Date;
    deleted_by_sender: number;
    deleted_by_recipient: number;
    created_at: Date;
    sender: User;
    recipient: User;
    groupChat: GroupChat;
}
