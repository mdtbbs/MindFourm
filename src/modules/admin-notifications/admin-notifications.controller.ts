import {
  Controller,
  Get,
  MessageEvent,
  Param,
  Put,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminNotificationStreamService } from './admin-notification-stream.service';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('moderator', 'admin')
export class AdminNotificationsController {
  constructor(
    private readonly adminNotificationsService: AdminNotificationsService,
    private readonly adminNotificationStreamService: AdminNotificationStreamService,
  ) {}

  @Sse('events')
  sseEvents(@Req() req: any): Observable<MessageEvent> {
    return this.adminNotificationStreamService.createStream(req.user.id);
  }

  @Get()
  async getNotifications(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const result = await this.adminNotificationsService.getByUserId(
      req.user.id,
      Number(page) || 1,
      Number(limit) || 20,
    );

    return {
      data: result.notifications,
      total: result.total,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      totalPages: Math.ceil(result.total / (Number(limit) || 20)),
    };
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    const count = await this.adminNotificationsService.getUnreadCount(req.user.id);
    return { count };
  }

  @Put(':id/read')
  async markAsRead(@Param('id') id: number, @Req() req: any) {
    await this.adminNotificationsService.markAsRead(Number(id), req.user.id);
    return { message: 'Admin notification marked as read' };
  }

  @Put('read-all')
  async markAllAsRead(@Req() req: any) {
    await this.adminNotificationsService.markAllAsRead(req.user.id);
    return { message: 'All admin notifications marked as read' };
  }
}
