import { Controller, Get, Param, ParseIntPipe, Put, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { OAuthProtected } from '../../../common/decorators/oauth-protected.decorator';
import { NotificationsService } from '../notifications.service';
import { QueryPostPageDto } from '../../posts/dto/query-post-lists.dto';
import { SettingsService } from '../../settings/settings.service';
import { ApiV1Exception } from '../../../common/exceptions/api-v1.exception';
import { HttpStatus } from '@nestjs/common';

const NOTIFICATION_ITEM_SCHEMA: any = {
  type: 'object', required: ['id', 'user_id', 'type', 'actor_id', 'actor_name', 'actor_avatar', 'post_id', 'post_title', 'reply_id', 'content', 'is_read', 'created_at'],
  properties: {
    id: { type: 'integer', example: 456, description: '通知 ID。' },
    user_id: { type: 'integer', example: 45, description: '接收者论坛用户 ID。' },
    type: { type: 'string', example: 'reply', description: '通知事件类型。' },
    actor_id: { type: 'integer', nullable: true, example: 67, description: '触发通知的用户 ID。' },
    actor_name: { type: 'string', nullable: true, example: 'builder', description: '触发通知的用户名。' },
    actor_avatar: { type: 'string', nullable: true, example: null, description: '触发通知用户的头像 URL。' },
    post_id: { type: 'integer', nullable: true, example: 123, description: '关联讨论 ID。' },
    post_title: { type: 'string', nullable: true, example: '新手建筑布局分享', description: '关联讨论标题。' },
    reply_id: { type: 'integer', nullable: true, example: 789, description: '关联回复 ID。' },
    content: { type: 'string', nullable: true, example: '我补充了一个方案。', description: '通知正文。' },
    is_read: { type: 'boolean', example: false, description: '是否已读。' },
    created_at: { type: 'string', format: 'date-time', example: '2026-09-30T12:30:00.000Z', description: '通知时间。' },
  },
};

@ApiV1()
@ApiTags('v1-notifications')
@Controller('v1/notifications')
export class NotificationsV1Controller {
  constructor(private readonly notifications: NotificationsService, private readonly settings: SettingsService) {}

  @Get()
  @OAuthProtected('notification.read')
  @ApiQuery({ name: 'page', required: false, type: Number, schema: { minimum: 1 }, example: 1, description: '结果页码，从 1 开始。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 50 }, example: 20, description: '每页通知数，最大 50。' })
  @ApiOkResponse({ description: '按时间倒序返回通知；分页信息在 data.pagination 和 meta.pagination 中。', schema: { type: 'object', required: ['items', 'pagination'], properties: {
    items: { type: 'array', description: '当前页通知。', items: NOTIFICATION_ITEM_SCHEMA },
    pagination: { type: 'object', required: ['page', 'limit', 'total', 'total_pages'], properties: {
      page: { type: 'integer', example: 1, description: '当前页。' },
      limit: { type: 'integer', example: 20, description: '每页条数。' },
      total: { type: 'integer', example: 42, description: '通知总数。' },
      total_pages: { type: 'integer', example: 3, description: '总页数。' },
    } },
  } } })
  async list(@Req() req: any, @Query() query: QueryPostPageDto) {
    await this.assertEnabled();
    const currentPage = query.page ?? 1;
    const currentLimit = Math.min(50, query.limit ?? 20);
    const result = await this.notifications.getByUserId(req.user.id, currentPage, currentLimit, 'all');
    const response: any = {
      items: result.notifications,
      pagination: { page: currentPage, limit: currentLimit, total: result.total, total_pages: Math.ceil(result.total / currentLimit) },
    };
    Object.defineProperty(response, '__v1Pagination', { value: { page: currentPage, limit: currentLimit, total: result.total, total_pages: Math.ceil(result.total / currentLimit), has_more: currentPage < Math.ceil(result.total / currentLimit) }, enumerable: false });
    return response;
  }

  @Get('unread-count')
  @OAuthProtected('notification.read')
  @ApiOkResponse({ description: '当前用户未读通知总数。', schema: { type: 'object', required: ['count'], properties: { count: { type: 'integer', example: 5, description: '未读通知数。' } } } })
  async unreadCount(@Req() req: any) { await this.assertEnabled(); return { count: await this.notifications.getUnreadCount(req.user.id) }; }

  @Put(':id/read')
  @OAuthProtected('notification.read')
  @ApiOkResponse({ description: '通知已标为已读。', schema: { type: 'object', required: ['read'], properties: { read: { type: 'boolean', example: true, description: '是否已读。' } } } })
  async markRead(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.assertEnabled();
    await this.notifications.markAsRead(id, req.user.id);
    return { read: true };
  }

  @Put('read-all')
  @OAuthProtected('notification.read')
  @ApiOkResponse({ description: '当前用户的通知已全部标为已读。', schema: { type: 'object', required: ['read'], properties: { read: { type: 'boolean', example: true, description: '是否已全部标记为已读。' } } } })
  async markAllRead(@Req() req: any) {
    await this.assertEnabled();
    await this.notifications.markAllAsRead(req.user.id);
    return { read: true };
  }

  private async assertEnabled() {
    if (!await this.settings.getBoolean('feature_notifications_v1_enabled', true)) {
      throw new ApiV1Exception('FEATURE_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭 Public Client 通知接口', false);
    }
  }
}
