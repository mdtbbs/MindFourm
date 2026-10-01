import { Body, Controller, Delete, HttpStatus, Optional, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { OAuthProtected } from '../../../common/decorators/oauth-protected.decorator';
import { getClientIp, getClientRegion } from '../../../common/utils/client-context.util';
import { CreatePostDto } from '../../posts/dto/create-post.dto';
import { UpdatePostDto } from '../../posts/dto/update-post.dto';
import { PostsService } from '../../posts/posts.service';
import { CreateReplyDto } from '../../replies/dto/create-reply.dto';
import { UpdateReplyDto } from '../../replies/dto/update-reply.dto';
import { RepliesService } from '../../replies/replies.service';
import { SettingsService } from '../../settings/settings.service';
import { ApiV1Exception } from '../../../common/exceptions/api-v1.exception';
import { CommunityChallengeService } from '../../community-challenges/community-challenge.service';
import { REPLY_WRITE_SCHEMA, THREAD_WRITE_SCHEMA } from './thread-v1.openapi';

/**
 * First-party Android write transport.  The underlying post/reply services are
 * authoritative for ownership, moderation, mention notifications, rate limits
 * and phone-verification policy; this controller deliberately adds no parallel
 * business rules and never returns audit fields such as source IP addresses.
 */
@ApiV1()
@ApiTags('v1-thread-writes')
@Controller('v1/threads')
export class ThreadWriteV1Controller {
  constructor(
    private readonly posts: PostsService,
    private readonly replies: RepliesService,
    @Optional() private readonly settings?: SettingsService,
    @Optional() private readonly communityChallenge?: CommunityChallengeService,
  ) {}

  @Post()
  @OAuthProtected('forum.write')
  @ApiCreatedResponse({ description: '讨论已创建；按站点审核策略可能返回 pending。', schema: THREAD_WRITE_SCHEMA })
  async createThread(@Body() dto: CreatePostDto, @Req() req: any) {
    await this.assertWritesEnabled();
    const ipAddress = getClientIp(req);
    if (dto.status !== 'draft') await this.communityChallenge?.enforceContentAction({
      action: 'forum.post.create',
      text: `${dto.title || ''}\n${dto.content || ''}`,
      actorId: req.user.id,
      remoteIp: ipAddress,
      proof: {
        token: req.headers?.['x-forum-challenge-token'],
        response: req.headers?.['x-forum-challenge-response'],
      },
    });
    const post = await this.posts.create(dto, req.user.id, {
      ipAddress,
      locationLabel: getClientRegion(req),
    });
    return this.threadWriteDto(post!);
  }

  @Put(':id')
  @OAuthProtected('forum.write')
  @ApiOkResponse({ description: '讨论已更新。', schema: THREAD_WRITE_SCHEMA })
  async updateThread(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostDto,
    @Req() req: any,
  ) {
    await this.assertWritesEnabled();
    const post = await this.posts.update(id, dto, req.user.id, req.user.role);
    return this.threadWriteDto(post);
  }

  @Delete(':id')
  @OAuthProtected('forum.write')
  @ApiOkResponse({ description: '讨论已软删除。', schema: { type: 'object', required: ['deleted'], properties: { deleted: { type: 'boolean', example: true, description: '是否已删除。' } } } })
  async deleteThread(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.assertWritesEnabled();
    await this.posts.softDelete(id, req.user.id, req.user.role);
    return { deleted: true };
  }

  @Post(':id/replies')
  @OAuthProtected('forum.write')
  @ApiBody({ type: CreateReplyDto, description: '正文至少提供 content（兼容 Markdown）或 content_json（推荐；与 content_schema_version: 2 一起使用）之一。' })
  @ApiCreatedResponse({ description: '回复已创建；按站点审核策略可能返回 pending。', schema: REPLY_WRITE_SCHEMA })
  async createReply(
    @Param('id', ParseIntPipe) threadId: number,
    @Body() dto: CreateReplyDto,
    @Req() req: any,
  ) {
    await this.assertWritesEnabled();
    const ipAddress = getClientIp(req);
    await this.communityChallenge?.enforceContentAction({
      action: 'forum.reply.create',
      text: dto.content || '',
      actorId: req.user.id,
      remoteIp: ipAddress,
      proof: {
        token: req.headers?.['x-forum-challenge-token'],
        response: req.headers?.['x-forum-challenge-response'],
      },
    });
    const reply = await this.replies.createReplyForPost(threadId, dto, req.user.id, {
      ipAddress,
      locationLabel: getClientRegion(req),
    });
    return this.replyWriteDto(reply);
  }

  @Put(':threadId/replies/:replyId')
  @OAuthProtected('forum.write')
  @ApiOkResponse({ description: '回复已更新。', schema: REPLY_WRITE_SCHEMA })
  async updateReply(
    @Param('threadId', ParseIntPipe) _threadId: number,
    @Param('replyId', ParseIntPipe) replyId: number,
    @Body() dto: UpdateReplyDto,
    @Req() req: any,
  ) {
    await this.assertWritesEnabled();
    const reply = await this.replies.update(replyId, dto.content, req.user.id, req.user.role, dto.content_json, dto.content_schema_version);
    return this.replyWriteDto(reply);
  }

  @Delete(':threadId/replies/:replyId')
  @OAuthProtected('forum.write')
  @ApiOkResponse({ description: '回复已软删除。', schema: { type: 'object', required: ['deleted'], properties: { deleted: { type: 'boolean', example: true, description: '是否已删除。' } } } })
  async deleteReply(
    @Param('threadId', ParseIntPipe) _threadId: number,
    @Param('replyId', ParseIntPipe) replyId: number,
    @Req() req: any,
  ) {
    await this.assertWritesEnabled();
    await this.replies.softDelete(replyId, req.user.id, req.user.role);
    return { deleted: true };
  }

  private threadWriteDto(post: any) {
    return {
      id: post.id,
      public_id: null,
      title: post.title,
      content: post.content,
      content_format: 'tiptap_json',
      content_schema_version: post.content_schema_version ?? 2,
      content_html: post.content_html ?? null,
      content_json: post.content_json ?? null,
      content_text: post.content_text ?? null,
      status: post.status,
      created_at: post.created_at?.toISOString?.() ?? null,
      updated_at: post.updated_at?.toISOString?.() ?? null,
    };
  }

  private replyWriteDto(reply: any) {
    return {
      id: reply.id,
      post_id: reply.post_id,
      parent_reply_id: reply.parent_reply_id ?? null,
      content: reply.content,
      content_format: 'tiptap_json',
      content_schema_version: reply.content_schema_version ?? 2,
      content_html: reply.content_html ?? null,
      content_json: reply.content_json ?? null,
      content_text: reply.content_text ?? null,
      status: reply.status,
      created_at: reply.created_at?.toISOString?.() ?? null,
      updated_at: reply.updated_at?.toISOString?.() ?? null,
    };
  }

  private async assertWritesEnabled() {
    if (this.settings && !await this.settings.getBoolean('feature_public_api_forum_write_enabled', true)) {
      throw new ApiV1Exception('FEATURE_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭 Public Client 论坛写入', false);
    }
  }
}
