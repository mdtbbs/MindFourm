import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { UpdateEmailPreferenceDto } from './dto/update-email-preference.dto';
import { Observable } from 'rxjs';
import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class NotificationsController implements OnModuleInit, OnModuleDestroy {
    private readonly notificationsService;
    private notificationSubjects;
    private redisSubscriber;
    constructor(notificationsService: NotificationsService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    sseEvents(req: any): Observable<MessageEvent>;
    pushNotification(userId: number, notification: any): void;
    getNotifications(req: any, query: QueryNotificationsDto): Promise<{
        data: import("../../entities").Notification[];
        pagination: {
            page: number | undefined;
            limit: number | undefined;
            total: number;
        };
    }>;
    getNotificationsCursor(req: any, limit?: number, cursor?: string): Promise<{
        data: import("../../entities").Notification[];
        nextCursor: string | undefined;
    }>;
    getUnreadCount(req: any): Promise<{
        count: number;
    }>;
    markAsRead(id: number, req: any): Promise<{
        message: string;
    }>;
    markAllAsRead(req: any): Promise<{
        message: string;
    }>;
    getEmailPreference(req: any): Promise<{
        data: {
            reply_email: boolean;
            mention_email: boolean;
            message_email: boolean;
            system_email: boolean;
            digest_email: boolean;
        };
    }>;
    updateEmailPreference(req: any, dto: UpdateEmailPreferenceDto): Promise<{
        data: {
            reply_email: boolean;
            mention_email: boolean;
            message_email: boolean;
            system_email: boolean;
            digest_email: boolean;
        };
    }>;
}
