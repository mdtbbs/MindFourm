import { Controller, Get, Put, Query, Param, UseGuards, Req, Body, Patch, Sse } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationStreamService } from './notification-stream.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { UpdateEmailPreferenceDto } from './dto/update-email-preference.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Observable, Subject, concat, of } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';

@Controller('notifications')
export class NotificationsController implements OnModuleInit, OnModuleDestroy {
  /**
   * Open SSE connections per user. A Set rather than a single Subject because one
   * user can have several tabs open, and each needs its own lifecycle so closing one
   * does not tear down the others.
   */
  private connections: Map<number, Set<Subject<MessageEvent>>> = new Map();
  private streamSubscription: any;

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationStream: NotificationStreamService,
  ) {}

  onModuleInit() {
    // Subscribe to the notification stream and fan out to that user's connections
    this.streamSubscription = this.notificationStream.stream$.subscribe(
      ({ userId, notification }) => {
        const subjects = this.connections.get(userId);
        if (!subjects) return;

        const event = {
          data: JSON.stringify({ type: 'notification', data: notification }),
        } as MessageEvent;

        for (const subject of subjects) {
          subject.next(event);
        }
      },
    );
  }

  onModuleDestroy() {
    if (this.streamSubscription) {
      this.streamSubscription.unsubscribe();
    }
    for (const subjects of this.connections.values()) {
      for (const subject of subjects) {
        subject.complete();
      }
    }
    this.connections.clear();
  }

  /**
   * SSE endpoint for real-time notifications.
   *
   * Each request gets its own Subject, registered on subscribe and removed on
   * teardown. The previous version stored one Subject per user id and never removed
   * it, so the map grew without bound as users came and went.
   */
  @Sse('events')
  @UseGuards(JwtAuthGuard)
  sseEvents(@Req() req: any): Observable<MessageEvent> {
    const userId = req.user.id;
    const subject = new Subject<MessageEvent>();

    const connected = {
      data: JSON.stringify({ type: 'connected', userId }),
    } as MessageEvent;

    // `startWith` rather than an eager `subject.next(...)`: the handler returns
    // before Nest subscribes, and a plain Subject does not replay, so the connected
    // event used to be emitted into the void every single time.
    return concat(of(connected), subject.asObservable()).pipe(
      tap({
        subscribe: () => {
          const subjects = this.connections.get(userId) ?? new Set();
          subjects.add(subject);
          this.connections.set(userId, subjects);
        },
      }),
      finalize(() => {
        const subjects = this.connections.get(userId);
        if (!subjects) return;

        subjects.delete(subject);
        subject.complete();
        if (subjects.size === 0) {
          this.connections.delete(userId);
        }
      }),
    );
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
