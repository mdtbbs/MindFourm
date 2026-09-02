import { Body, Controller, Delete, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { getClientIp, getClientRegion } from '../../../common/utils/client-context.util';
import { CreatePostDto } from '../../posts/dto/create-post.dto';
import { UpdatePostDto } from '../../posts/dto/update-post.dto';
import { PostsService } from '../../posts/posts.service';
import { CreateReplyDto } from '../../replies/dto/create-reply.dto';
import { UpdateReplyDto } from '../../replies/dto/update-reply.dto';
import { RepliesService } from '../../replies/replies.service';

/**
 * First-party Android write transport.  The underlying post/reply services are
 * authoritative for ownership, moderation, mention notifications, rate limits
 * and phone-verification policy; this controller deliberately adds no parallel
 * business rules and never returns audit fields such as source IP addresses.
 */
@ApiV1()
@ApiTags('v1-thread-writes')
@Controller('v1/threads')
@UseGuards(JwtAuthGuard)
export class ThreadWriteV1Controller {
  constructor(
    private readonly posts: PostsService,
    private readonly replies: RepliesService,
  ) {}

  @Post()
  @ApiCreatedResponse({ description: 'Thread created. It can be pending moderation.' })
  async createThread(@Body() dto: CreatePostDto, @Req() req: any) {
    const post = await this.posts.create(dto, req.user.id, {
      ipAddress: getClientIp(req),
      locationLabel: getClientRegion(req),
    });
    return this.threadWriteDto(post!);
  }

  @Put(':id')
  @ApiOkResponse({ description: 'Thread updated by its owner or staff.' })
  async updateThread(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostDto,
    @Req() req: any,
  ) {
    const post = await this.posts.update(id, dto, req.user.id, req.user.role);
    return this.threadWriteDto(post);
  }

  @Delete(':id')
  @ApiNoContentResponse({ description: 'Thread soft-deleted by its owner or staff.' })
  async deleteThread(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.posts.softDelete(id, req.user.id, req.user.role);
    return { deleted: true };
  }

  @Post(':id/replies')
  @ApiCreatedResponse({ description: 'Reply created. It can be pending moderation.' })
  async createReply(
    @Param('id', ParseIntPipe) threadId: number,
    @Body() dto: CreateReplyDto,
    @Req() req: any,
  ) {
    const reply = await this.replies.createReplyForPost(threadId, dto, req.user.id, {
      ipAddress: getClientIp(req),
      locationLabel: getClientRegion(req),
    });
    return this.replyWriteDto(reply);
  }

  @Put(':threadId/replies/:replyId')
  @ApiOkResponse({ description: 'Reply updated by its owner or staff.' })
  async updateReply(
    @Param('threadId', ParseIntPipe) _threadId: number,
    @Param('replyId', ParseIntPipe) replyId: number,
    @Body() dto: UpdateReplyDto,
    @Req() req: any,
  ) {
    const reply = await this.replies.update(replyId, dto.content, req.user.id, req.user.role);
    return this.replyWriteDto(reply);
  }

  @Delete(':threadId/replies/:replyId')
  @ApiNoContentResponse({ description: 'Reply soft-deleted by its owner or staff.' })
  async deleteReply(
    @Param('threadId', ParseIntPipe) _threadId: number,
    @Param('replyId', ParseIntPipe) replyId: number,
    @Req() req: any,
  ) {
    await this.replies.softDelete(replyId, req.user.id, req.user.role);
    return { deleted: true };
  }

  private threadWriteDto(post: any) {
    return {
      id: post.id,
      public_id: null,
      title: post.title,
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
      content_html: reply.content_html ?? null,
      status: reply.status,
      created_at: reply.created_at?.toISOString?.() ?? null,
      updated_at: reply.updated_at?.toISOString?.() ?? null,
    };
  }
}
