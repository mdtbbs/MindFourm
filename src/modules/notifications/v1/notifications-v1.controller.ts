import { Controller, Get, Param, ParseIntPipe, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NotificationsService } from '../notifications.service';
import { QueryPostPageDto } from '../../posts/dto/query-post-lists.dto';
import { OAuthScopeGuard } from '../../../common/guards/oauth-scope.guard';
import { RequireOAuthScopes } from '../../../common/decorators/require-oauth-scopes.decorator';
import { SettingsService } from '../../settings/settings.service';
import { ApiV1Exception } from '../../../common/exceptions/api-v1.exception';
import { HttpStatus } from '@nestjs/common';

@ApiV1()
@ApiTags('v1-notifications')
@Controller('v1/notifications')
@UseGuards(JwtAuthGuard, OAuthScopeGuard)
@RequireOAuthScopes('notification.read')
export class NotificationsV1Controller {
  constructor(private readonly notifications: NotificationsService, private readonly settings: SettingsService) {}

  @Get()
  @ApiOkResponse({ description: 'Current user notifications, newest first.' })
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
  async unreadCount(@Req() req: any) { await this.assertEnabled(); return { count: await this.notifications.getUnreadCount(req.user.id) }; }

  @Put(':id/read')
  async markRead(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.assertEnabled();
    await this.notifications.markAsRead(id, req.user.id);
    return { read: true };
  }

  @Put('read-all')
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
