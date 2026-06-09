import { Controller, Get, Put, Query, Param, UseGuards, Req, Body, Patch, Sse } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { UpdateEmailPreferenceDto } from './dto/update-email-preference.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Observable, Subject } from 'rxjs';
import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';

@Controller('notifications')
export class NotificationsController implements OnModuleInit, OnModuleDestroy {
  private notificationSubjects: Map<number, Subject<MessageEvent>> = new Map();
  private redisSubscriber: any;

  constructor(private readonly notificationsService: NotificationsService) {}

  onModuleInit() {
    // Initialize Redis subscriber for notification events
    // This will be set up in the service
  }

  onModuleDestroy() {
    // Cleanup all SSE connections
    for (const subject of this.notificationSubjects.values()) {
      subject.complete();
    }
    this.notificationSubjects.clear();
  }

  /**
   * SSE endpoint for real-time notifications
   *
   * Clients connect to this endpoint and receive real-time notification events.
   * The endpoint uses JWT authentication via cookie/session.
   */
  @Sse('events')
  @UseGuards(JwtAuthGuard)
  sseEvents(@Req() req: any): Observable<MessageEvent> {
    const userId = req.user.id;

    // Create or get existing subject for this user
    if (!this.notificationSubjects.has(userId)) {
      this.notificationSubjects.set(userId, new Subject<MessageEvent>());
    }

    const subject = this.notificationSubjects.get(userId);

    if (!subject) {
      throw new Error('Failed to create SSE subject');
    }

    // Send initial connection message
    subject.next({
      data: JSON.stringify({ type: 'connected', userId }),
    } as MessageEvent);

    // Return the observable stream
    return subject.asObservable();
  }

  /**
   * Push notification to SSE stream for a specific user
   * Called by NotificationsService when a new notification is created
   */
  pushNotification(userId: number, notification: any) {
    const subject = this.notificationSubjects.get(userId);
    if (subject) {
      subject.next({
        data: JSON.stringify({ type: 'notification', data: notification }),
      } as MessageEvent);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getNotifications(
    @Req() req: any,
    @Query() query: QueryNotificationsDto,
  ) {
    const userId = req.user.id;
    const result = await this.notificationsService.getByUserId(
      userId,
      query.page,
      query.limit,
    );
    return {
      data: result.notifications,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('cursor')
  async getNotificationsCursor(
    @Req() req: any,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    const userId = req.user.id;
    const result = await this.notificationsService.getByUserIdCursor(
      userId,
      limit ? Number(limit) : 20,
      cursor,
    );
    return {
      data: result.notifications,
      nextCursor: result.nextCursor,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    const userId = req.user.id;
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/read')
  async markAsRead(@Param('id') id: number, @Req() req: any) {
    const userId = req.user.id;
    await this.notificationsService.markAsRead(Number(id), userId);
    return { message: 'Notification marked as read' };
  }

  @UseGuards(JwtAuthGuard)
  @Put('read-all')
  async markAllAsRead(@Req() req: any) {
    const userId = req.user.id;
    await this.notificationsService.markAllAsRead(userId);
    return { message: 'All notifications marked as read' };
  }

  // Email preference endpoints
  @UseGuards(JwtAuthGuard)
  @Get('email-preference')
  async getEmailPreference(@Req() req: any) {
    const userId = req.user.id;
    const preference = await this.notificationsService.getEmailPreference(userId);
    return { data: preference };
  }

  @UseGuards(JwtAuthGuard)
  @Put('email-preference')
  async updateEmailPreference(
    @Req() req: any,
    @Body() dto: UpdateEmailPreferenceDto,
  ) {
    const userId = req.user.id;
    const preference = await this.notificationsService.updateEmailPreference(userId, dto);
    return { data: preference };
  }
}
