import { Repository } from 'typeorm';
import { RedisService } from '../../database/redis.service';
import { Notification } from '../../entities/notification.entity';
import { User } from '../../entities/user.entity';
import { Post } from '../../entities/post.entity';
import { Reply } from '../../entities/reply.entity';
import { EmailLog } from '../../entities/email-log.entity';
import { EmailQueueService } from './email-queue.service';
import { SettingsService } from '../settings/settings.service';
export declare class NotificationsService {
    private notificationRepository;
    private userRepository;
    private postRepository;
    private replyRepository;
    private emailLogRepository;
    private redisService;
    private emailQueueService;
    private settingsService;
    private frontendUrl;
    constructor(notificationRepository: Repository<Notification>, userRepository: Repository<User>, postRepository: Repository<Post>, replyRepository: Repository<Reply>, emailLogRepository: Repository<EmailLog>, redisService: RedisService, emailQueueService: EmailQueueService, settingsService: SettingsService);
    private getSiteName;
    private queueEmailIfEnabled;
    private renderEmailTemplate;
    create(data: {
        user_id: number;
        type: string;
        actor_id?: number;
        post_id?: number;
        reply_id?: number;
        content?: string;
    }): Promise<Notification>;
    private sendEmailForNotification;
    private truncateHtml;
    notifyPostAuthor(postId: number, data: {
        type: string;
        actor_id: number;
        reply_id?: number;
        content?: string;
    }): Promise<Notification | undefined>;
    notifyMentionedUsers(content: string, postId: number, actorId: number, replyId?: number, skipUserIds?: number[]): Promise<Notification[]>;
    getByUserId(userId: number, page?: number, limit?: number): Promise<{
        notifications: Notification[];
        total: number;
    }>;
    getByUserIdCursor(userId: number, limit?: number, cursor?: string): Promise<{
        notifications: Notification[];
        nextCursor?: string;
    }>;
    getUnreadCount(userId: number): Promise<number>;
    markAsRead(notificationId: number, userId: number): Promise<void>;
    markAllAsRead(userId: number): Promise<void>;
    getEmailPreference(userId: number): Promise<{
        reply_email: boolean;
        mention_email: boolean;
        message_email: boolean;
        system_email: boolean;
        digest_email: boolean;
    }>;
    updateEmailPreference(userId: number, dto: {
        reply_email?: boolean;
        mention_email?: boolean;
        message_email?: boolean;
        system_email?: boolean;
        digest_email?: boolean;
    }): Promise<{
        reply_email: boolean;
        mention_email: boolean;
        message_email: boolean;
        system_email: boolean;
        digest_email: boolean;
    }>;
}
