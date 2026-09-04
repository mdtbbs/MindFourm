import { Controller, Get, Param, ParseIntPipe, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NotificationsService } from '../notifications.service';
import { QueryPostPageDto } from '../../posts/dto/query-post-lists.dto';

@ApiV1()
@ApiTags('v1-notifications')
@Controller('v1/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsV1Controller {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ description: 'Current user notifications, newest first.' })
  async list(@Req() req: any, @Query() query: QueryPostPageDto) {
    const currentPage = query.page ?? 1;
    const currentLimit = Math.min(50, query.limit ?? 20);
    const result = await this.notifications.getByUserId(req.user.id, currentPage, currentLimit, 'all');
    return {
      items: result.notifications,
      pagination: { page: currentPage, limit: currentLimit, total: result.total, total_pages: Math.ceil(result.total / currentLimit) },
    };
  }

  @Get('unread-count')
  async unreadCount(@Req() req: any) { return { count: await this.notifications.getUnreadCount(req.user.id) }; }

  @Put(':id/read')
  async markRead(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.notifications.markAsRead(id, req.user.id);
    return { read: true };
  }

  @Put('read-all')
  async markAllRead(@Req() req: any) {
    await this.notifications.markAllAsRead(req.user.id);
    return { read: true };
  }
}
