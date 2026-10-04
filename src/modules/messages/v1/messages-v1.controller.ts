import { Body, Controller, Get, HttpStatus, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { ApiV1Exception } from '../../../common/exceptions/api-v1.exception';
import { OAuthProtected } from '../../../common/decorators/oauth-protected.decorator';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { SettingsService } from '../../settings/settings.service';
import { MessagesService } from '../messages.service';
import { CreateMessageV1Dto, MessagePageV1Dto } from './messages-v1.dto';

const MESSAGE_CURSOR_FIELDS: any = {
  next_cursor: { type: 'string', nullable: true, example: 'CURSOR_FROM_THIS_RESPONSE', description: '下一页游标；复制到下次请求的 cursor 参数。' },
  has_more: { type: 'boolean', example: true, description: '是否还有下一页。' },
};

const MESSAGE_ITEM_SCHEMA: any = {
  type: 'object',
  required: ['id', 'sender_id', 'recipient_id', 'content', 'content_html', 'is_read', 'created_at'],
  properties: {
    id: { type: 'integer', example: 456, description: '消息 ID。' },
    sender_id: { type: 'integer', example: 45, description: '发送者论坛用户 ID。' },
    recipient_id: { type: 'integer', example: 67, description: '接收者论坛用户 ID。' },
    content: { type: 'string', example: '稍后一起联机。', description: '消息纯文本。' },
    content_html: { type: 'string', nullable: true, example: '<p>稍后一起联机。</p>', description: '服务端生成的安全 HTML。' },
    is_read: { type: 'boolean', example: false, description: '接收者是否已读。' },
    created_at: { type: 'string', format: 'date-time', example: '2026-09-30T12:30:00.000Z', description: '发送时间。' },
  },
};

const MESSAGE_CONVERSATION_PAGE_SCHEMA: any = {
  type: 'object', required: ['items', 'next_cursor', 'has_more'],
  properties: {
    items: { type: 'array', description: '会话摘要。', items: { type: 'object', required: ['user_id', 'username', 'avatar_url', 'unread_count', 'last_at', 'last_content'], properties: {
      user_id: { type: 'integer', example: 45, description: '会话对方的论坛用户 ID。' },
      username: { type: 'string', example: 'builder', description: '会话对方用户名。' },
      avatar_url: { type: 'string', nullable: true, example: null, description: '会话对方头像 URL。' },
      unread_count: { type: 'integer', example: 2, description: '未读消息数。' },
      last_at: { type: 'string', format: 'date-time', example: '2026-09-30T12:30:00.000Z', description: '最近一条消息时间。' },
      last_content: { type: 'string', nullable: true, example: '稍后一起联机。', description: '最近一条消息正文。' },
    } } },
    ...MESSAGE_CURSOR_FIELDS,
  },
};

const MESSAGE_LIST_SCHEMA: any = {
  type: 'object', required: ['items', 'next_cursor', 'has_more'],
  properties: { items: { type: 'array', description: '当前会话消息，按发送时间正序返回。', items: MESSAGE_ITEM_SCHEMA }, ...MESSAGE_CURSOR_FIELDS },
};

@ApiV1()
@ApiTags('v1-messages')
@Controller('v1/messages')
export class MessagesV1Controller {
  constructor(private readonly messages: MessagesService, private readonly settings: SettingsService) {}

  @Get()
  @OAuthProtected('message.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ summary: '列出私信会话', description: '需要有效且未封禁的账号；OAuth Bearer 需要 message.read。若对方已屏蔽当前账号，不会泄露其会话摘要。每个账号每分钟最多 60 次。' })
  @ApiQuery({ name: 'cursor', required: false, type: String, example: 'CURSOR_FROM_PREVIOUS_PAGE', description: '上一页 data.next_cursor 返回的不透明游标。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 100 }, example: 50, description: '每页会话数量，默认 50。' })
  @ApiOkResponse({ description: '会话摘要游标分页；next_cursor 位于 data 中。', schema: MESSAGE_CONVERSATION_PAGE_SCHEMA })
  async conversations(@Req() req: any, @Query() query: MessagePageV1Dto) {
    await this.assertAccess(req);
    const result = await this.messages.getConversations(req.user.id, query.limit, query.cursor);
    return { items: result.data, next_cursor: result.nextCursor, has_more: result.hasMore };
  }

  @Get('unread-count')
  @OAuthProtected('message.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ summary: '读取未读私信数', description: '需要有效且未封禁的账号；OAuth Bearer 需要 message.read。每个账号每分钟最多 60 次。' })
  @ApiOkResponse({ description: '当前账号的未读消息数量。', schema: { type: 'object', required: ['count'], properties: { count: { type: 'integer', example: 3 } } } })
  async unreadCount(@Req() req: any) {
    await this.assertAccess(req);
    return { count: await this.messages.getUnreadCount(req.user.id) };
  }

  @Get(':userId')
  @OAuthProtected('message.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ summary: '读取私信会话', description: '需要有效且未封禁的账号；OAuth Bearer 需要 message.read。若对方已屏蔽当前账号，则拒绝读取。每个账号每分钟最多 60 次。' })
  @ApiQuery({ name: 'cursor', required: false, type: String, example: 'CURSOR_FROM_PREVIOUS_PAGE', description: '上一页 data.next_cursor 返回的不透明游标。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 100 }, example: 50, description: '每页消息数量，默认 50。' })
  @ApiOkResponse({ description: '消息游标分页，按时间正序返回；读取时会将收到的消息标为已读，next_cursor 位于 data 中。', schema: MESSAGE_LIST_SCHEMA })
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
  @OAuthProtected('message.write')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ summary: '发送私信', description: '需要有效且未封禁的账号；OAuth Bearer 需要 message.write。尊重收件人私信隐私设置及双方屏蔽关系，每个账号每分钟最多 10 次。' })
  @ApiCreatedResponse({ description: '消息已发送，并应用收件人隐私、屏蔽与通知策略。', schema: MESSAGE_ITEM_SCHEMA })
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
