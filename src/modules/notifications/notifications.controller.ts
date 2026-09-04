import { Controller, Get, Put, Query, Param, UseGuards, Req, Body, Patch, Sse } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationStreamService } from './notification-stream.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { UpdateEmailPreferenceDto } from './dto/update-email-preference.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Observable, Subject, concat, interval, merge, of } from 'rxjs';
import { finalize, map, tap } from 'rxjs/operators';
import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';

const SSE_HEARTBEAT_INTERVAL_MS = 20_000;

@Controller('notifications')
export class NotificationsController implements OnModuleInit, OnModuleDestroy {
  /**
   * Open SSE connections per user. A Set rather than a single Subject because one
   * user can have several tabs open, and each needs its own lifecycle so closing one
   * does not tear down the others.
   */
  private connections: Map<number, Set<Subject<MessageEvent>>> = new Map();
  private streamSubscription: any;
  private rawStreamSubscription: any;

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

    // Subscribe to raw events (friend_presence, etc.) and forward them verbatim
    this.rawStreamSubscription = this.notificationStream.rawStream$.subscribe(
      ({ userId, type, data }) => {
        const subjects = this.connections.get(userId);
        if (!subjects) return;

        const event = {
          data: JSON.stringify({ type, data }),
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
    if (this.rawStreamSubscription) {
      this.rawStreamSubscription.unsubscribe();
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
    // `event-source-polyfill` treats a quiet stream as dead after roughly 45
    // seconds. Keep the HTTP/2 response active even when the user has no new
    // notifications, otherwise it reconnects with `lastEventId` in a loop.
    const heartbeat = interval(SSE_HEARTBEAT_INTERVAL_MS).pipe(
      map(() => ({ data: JSON.stringify({ type: 'heartbeat' }) }) as MessageEvent),
    );

    return concat(of(connected), merge(subject.asObservable(), heartbeat)).pipe(
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
    // The DTO's initialisers only apply when the field is absent from the query, so
    // the declared type stays optional; resolve both here to keep the response's
    // `pagination` fully populated whichever way the request arrived.
    const currentPage = query.page ?? 1;
    const perPage = query.limit ?? 20;
    const result = await this.notificationsService.getByUserId(
      userId,
      currentPage,
      perPage,
      query.filter ?? 'all',
    );
    return {
      data: result.notifications,
      pagination: {
        page: currentPage,
        limit: perPage,
        total: result.total,
        // `totalPages` is not decoration: the web client's pagination normalizer
        // requires all four fields and returns null when any is absent, and its
        // callers read null as "no data" — so omitting it renders an empty list.
        totalPages: Math.max(1, Math.ceil(result.total / Math.max(1, perPage))),
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
    return this.notificationsService.getEmailPreference(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('email-preference')
  async updateEmailPreference(
    @Req() req: any,
    @Body() dto: UpdateEmailPreferenceDto,
  ) {
    const userId = req.user.id;
    return this.notificationsService.updateEmailPreference(userId, dto);
  }
}
