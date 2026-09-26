import { Body, Controller, Get, HttpStatus, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { ApiV1Exception } from '../../../common/exceptions/api-v1.exception';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { OAuthScopeGuard } from '../../../common/guards/oauth-scope.guard';
import { RequireOAuthScopes } from '../../../common/decorators/require-oauth-scopes.decorator';
import { SettingsService } from '../../settings/settings.service';
import { MessagesService } from '../messages.service';
import { CreateMessageV1Dto, MessagePageV1Dto } from './messages-v1.dto';

@ApiV1()
@ApiTags('v1-messages')
@Controller('v1/messages')
@UseGuards(JwtAuthGuard, OAuthScopeGuard)
export class MessagesV1Controller {
  constructor(private readonly messages: MessagesService, private readonly settings: SettingsService) {}

  @Get()
  @RequireOAuthScopes('message.read')
  @ApiOkResponse({ description: 'Cursor-paginated direct message conversations.' })
  async conversations(@Req() req: any, @Query() query: MessagePageV1Dto) {
    await this.assertAccess(req);
    const result = await this.messages.getConversations(req.user.id, query.limit, query.cursor);
    return { items: result.data, next_cursor: result.nextCursor, has_more: result.hasMore };
  }

  @Get('unread-count')
  @RequireOAuthScopes('message.read')
  async unreadCount(@Req() req: any) {
    await this.assertAccess(req);
    return { count: await this.messages.getUnreadCount(req.user.id) };
  }

  @Get(':userId')
  @RequireOAuthScopes('message.read')
  @ApiOkResponse({ description: 'Cursor-paginated direct conversation. Reading marks incoming messages as read.' })
  async conversation(@Req() req: any, @Param('userId', ParseIntPipe) userId: number, @Query() query: MessagePageV1Dto) {
    await this.assertAccess(req);
    const result = await this.messages.getConversation(req.user.id, userId, query.limit, query.cursor);
    return {
      items: result.data.map((message: any) => this.toMessage(message)),
      next_cursor: result.nextCursor,
      has_more: result.hasMore,
    };
  }

  @Post()
  @RequireOAuthScopes('message.write')
  @ApiCreatedResponse({ description: 'Message sent using the existing block and notification policy.' })
  async send(@Req() req: any, @Body() dto: CreateMessageV1Dto) {
    await this.assertAccess(req);
    return this.toMessage(await this.messages.create(dto as any, req.user.id));
  }

  private async assertAccess(req: any) {
    if (!await this.settings.getBoolean('feature_messages_enabled', true)) {
      throw new ApiV1Exception('MESSAGING_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭私信功能', false);
    }
    const auth = req.authContext;
    if (auth?.source === 'mindauth_oauth' && auth.partyType !== 'first_party'
      && !await this.settings.getBoolean('feature_messages_third_party_access_enabled', false)) {
      throw new ApiV1Exception('THIRD_PARTY_ACCESS_DISABLED', HttpStatus.FORBIDDEN, '站点未开放第三方客户端私信访问', false);
    }
  }

  private toMessage(message: any) {
    return {
      id: message.id,
      sender_id: message.sender_id,
      recipient_id: message.recipient_id,
      content: message.content,
      content_html: message.content_html,
      is_read: !!message.is_read,
      created_at: message.created_at?.toISOString?.() ?? message.created_at,
    };
  }
}
