import { MessagesService } from './messages.service';
import { CreateGroupChatDto } from './dto/create-group-chat.dto';
import type { Request } from 'express';
export declare class MessagesController {
    private readonly messagesService;
    constructor(messagesService: MessagesService);
    send(dto: {
        recipient_id: number;
        content: string;
    }, req: Request): Promise<import("../../entities").Message>;
    getConversations(req: Request, limit?: string, cursor?: string): Promise<{
        conversations: any;
        nextCursor: any;
    }>;
    unreadCount(req: Request): Promise<{
        count: number;
    }>;
    getConversation(req: Request, userId: number, limit?: string, cursor?: string): Promise<{
        messages: import("../../entities").Message[];
        nextCursor: string | null;
    }>;
    deleteMessage(id: number, req: Request): Promise<void>;
}
export declare class GroupChatsController {
    private readonly messagesService;
    constructor(messagesService: MessagesService);
    createGroupChat(dto: CreateGroupChatDto, req: Request): Promise<{
        success: boolean;
        data: import("../../entities").GroupChat;
    }>;
    getMyGroupChats(req: Request): Promise<{
        success: boolean;
        data: import("../../entities").GroupChat[];
    }>;
    getGroupChat(id: number, req: Request): Promise<{
        success: boolean;
        data: import("../../entities").GroupChat;
    }>;
    getGroupMessages(id: number, req: Request, limit?: string, cursor?: string): Promise<{
        messages: import("../../entities").Message[];
        nextCursor: string | null;
    }>;
    sendGroupMessage(id: number, dto: {
        content: string;
    }, req: Request): Promise<{
        success: boolean;
        data: import("../../entities").Message;
    }>;
    addGroupMember(id: number, dto: {
        user_id: number;
        role?: string;
    }): Promise<{
        success: boolean;
        data: import("../../entities").GroupChatMember;
    }>;
    removeGroupMember(id: number, userId: number): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    leaveGroupChat(id: number, req: Request): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    updateGroupChat(id: number, dto: {
        name?: string;
        description?: string;
    }, req: Request): Promise<{
        success: boolean;
        data: import("../../entities").GroupChat;
    }>;
}
