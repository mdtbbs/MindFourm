import { Repository, DataSource } from 'typeorm';
import { Message } from '@entities/message.entity';
import { User } from '@entities/user.entity';
import { GroupChat } from '@entities/group-chat.entity';
import { GroupChatMember } from '@entities/group-chat-member.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateGroupChatDto } from './dto/create-group-chat.dto';
import { RedisService } from '@database/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class MessagesService {
    private messageRepo;
    private userRepo;
    private groupChatRepo;
    private groupChatMemberRepo;
    private redisService;
    private notificationsService;
    private dataSource;
    constructor(messageRepo: Repository<Message>, userRepo: Repository<User>, groupChatRepo: Repository<GroupChat>, groupChatMemberRepo: Repository<GroupChatMember>, redisService: RedisService, notificationsService: NotificationsService, dataSource: DataSource);
    create(dto: CreateMessageDto, senderId: number): Promise<Message>;
    getConversations(userId: number, limit: number, cursor?: string): Promise<{
        conversations: any;
        nextCursor: any;
    }>;
    getConversation(userId: number, otherUserId: number, limit: number, cursor?: string): Promise<{
        messages: Message[];
        nextCursor: string | null;
    }>;
    getUnreadCount(userId: number): Promise<number>;
    deleteForUser(messageId: number, userId: number, isSender: boolean): Promise<void>;
    private decrementUnreadCount;
    createGroupChat(dto: CreateGroupChatDto, creatorId: number): Promise<GroupChat>;
    getMyGroupChats(userId: number): Promise<GroupChat[]>;
    getGroupChat(groupId: number, userId: number): Promise<GroupChat>;
    getGroupMessages(groupId: number, userId: number, limit?: number, cursor?: string): Promise<{
        messages: Message[];
        nextCursor: string | null;
    }>;
    sendGroupMessage(groupId: number, senderId: number, content: string): Promise<Message>;
    addGroupMember(groupId: number, userId: number, role?: string): Promise<GroupChatMember>;
    removeGroupMember(groupId: number, userId: number): Promise<void>;
    leaveGroupChat(groupId: number, userId: number): Promise<void>;
    updateGroupChat(groupId: number, userId: number, data: {
        name?: string;
        description?: string;
    }): Promise<GroupChat>;
}
