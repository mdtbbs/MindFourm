import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  HttpStatus,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostRevisionsService } from './post-revisions.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { LockPostDto } from './dto/lock-post.dto';
import { SetBestReplyDto } from './dto/set-best-reply.dto';
import { QueryPostRevisionsDto } from './dto/query-post-revisions.dto';
import {
  QueryPinnedDto,
  QueryPostPageDto,
  QueryPostSearchDto,
  QueryTrendingDto,
} from './dto/query-post-lists.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { OptionalAuth } from '@common/decorators/public.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { LogsService } from '../logs/logs.service';
import { getClientIp, getClientRegion } from '@common/utils/client-context.util';

@Controller('posts')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly postRevisionsService: PostRevisionsService,
    private readonly logsService: LogsService,
  ) {}

  /**
   * GET /api/posts - List posts (page-based pagination)
   * Admins/moderators see pending posts; regular users see own pending posts.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @OptionalAuth()
  async findAll(@Query() query: QueryPostsDto, @Req() req: any) {
    return this.postsService.findAll(query, req.user);
  }

  /**
   * GET /api/posts/cursor - List posts (cursor-based pagination)
   */
  @Get('cursor')
  @UseGuards(JwtAuthGuard)
  @OptionalAuth()
  async findAllCursor(@Query() query: QueryPostsDto, @Req() req: any) {
    return this.postsService.findAllCursor(query, req.user);
  }

  /**
   * GET /api/posts/trending - Get trending posts
   */
  @Get('trending')
  async getTrending(@Query() query: QueryTrendingDto) {
    return this.postsService.getTrending(query.limit ?? 10);
  }

  /**
   * GET /api/posts/pinned - Get pinned posts
   */
  @Get('pinned')
  async getPinned(@Query() query: QueryPinnedDto) {
    return this.postsService.getPinned(query.category_id);
  }

  /**
   * GET /api/posts/search - Search posts
   */
  @Get('search')
  async search(@Query() query: QueryPostSearchDto) {
    const term = query.q.trim();
    if (!term) {
      return [];
    }
    return this.postsService.search(term, query.limit ?? 20);
  }

  /**
   * GET /api/posts/:id - Get post detail with replies
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @OptionalAuth()
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('reply_page') replyPage?: string,
    @Query('reply_limit') replyLimit?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    const parsedReplyPage = replyPage
      ? parseInt(replyPage, 10)
      : page
        ? parseInt(page, 10)
        : 1;
    const parsedReplyLimit = replyLimit
      ? parseInt(replyLimit, 10)
      : limit
        ? parseInt(limit, 10)
        : 20;
    const post = await this.postsService.findById(id, req?.user);
    const replies = await this.postsService.getReplies(
      id,
      Number.isFinite(parsedReplyLimit) ? parsedReplyLimit : 20,
      Number.isFinite(parsedReplyPage) ? parsedReplyPage : 1,
    );

    return {
      ...post,
      current_user_role: req?.user?.role ?? null,
      // Lets the client decide whether to offer edit/delete without shipping the
      // viewer's id to every reader. The API still authorises each write itself.
      is_owner: req?.user?.id != null && req.user.id === post.user_id,
      replies: replies.data,
      replyPagination: {
        total: replies.total,
        page: replies.page,
        limit: replies.limit,
        totalPages: replies.totalPages,
      },
    };
  }

  /**
   * POST /api/posts - Create a new post (auth required)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @RateLimit({ max: 10, window: 60 })
  async create(@Body() dto: CreatePostDto, @Req() req: any) {
    const userId = req.user.id;
    const post = await this.postsService.create(dto, userId, {
      ipAddress: getClientIp(req),
      locationLabel: getClientRegion(req),
    });
    await this.logOperation(req, 'post.create', 'post', post?.id, {
      status: post?.status,
      title: post?.title,
    });
    return post;
  }

  /**
   * PUT /api/posts/:id - Update a post (auth + ownership/permission)
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    const userRole = req.user.role;
    const post = await this.postsService.update(id, dto, userId, userRole);
    await this.logOperation(req, 'post.update', 'post', id, {
      status: post?.status,
      title: post?.title,
    });
    return post;
  }

  /**
   * DELETE /api/posts/:id - Soft delete a post (auth + ownership/permission)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    const userRole = req.user.role;
    await this.postsService.softDelete(id, userId, userRole);
    await this.logOperation(req, 'post.delete', 'post', id);
    return { message: '帖子删除成功' };
  }

  /**
   * PUT /api/posts/:id/pin - Pin/unpin a post (admin/moderator only)
   */
  @Put(':id/pin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async pin(
    @Param('id', ParseIntPipe) id: number,
    @Body('is_pinned') isPinned: number,
    @Req() req: any,
  ) {
    const post = await this.postsService.pin(id, isPinned ? 1 : 0);
    await this.logOperation(req, 'post.pin', 'post', id, { is_pinned: isPinned ? 1 : 0 });
    return post;
  }

  /**
   * PUT /api/posts/:id/lock - Close/reopen a post to replies (admin/moderator only)
   *
   * The guard is not the enforcement point: `RepliesService` refuses to write a reply
   * to a locked post, so hiding the composer in the client is cosmetic.
   */
  @Put(':id/lock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async lock(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LockPostDto,
    @Req() req: any,
  ) {
    const post = await this.postsService.setLocked(id, dto.locked, req.user);
    await this.logOperation(req, 'post.lock', 'post', id, { is_locked: dto.locked ? 1 : 0 });
    return post;
  }

  /**
   * PUT /api/posts/:id/best-reply - Accept a reply as the answer, or clear the mark
   *
   * Author or staff, so the check lives in the service: ownership is not something
   * `RolesGuard` can express.
   */
  @Put(':id/best-reply')
  @UseGuards(JwtAuthGuard)
  async setBestReply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetBestReplyDto,
    @Req() req: any,
  ) {
    const result = await this.postsService.setBestReply(id, dto.reply_id, req.user);
    await this.logOperation(req, 'post.best_reply', 'post', id, { reply_id: dto.reply_id });
    return result;
  }

  /**
   * GET /api/posts/:id/revisions - Edit history (post author or staff only)
   */
  @Get(':id/revisions')
  @UseGuards(JwtAuthGuard)
  async listRevisions(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryPostRevisionsDto,
    @Req() req: any,
  ) {
    return this.postRevisionsService.list(id, req.user, query.page, query.limit);
  }

  /**
   * GET /api/posts/:id/revisions/:revisionId - One superseded version, with its body
   */
  @Get(':id/revisions/:revisionId')
  @UseGuards(JwtAuthGuard)
  async getRevision(
    @Param('id', ParseIntPipe) id: number,
    @Param('revisionId', ParseIntPipe) revisionId: number,
    @Req() req: any,
  ) {
    return this.postRevisionsService.get(id, revisionId, req.user);
  }

  /**
   * PUT /api/posts/:id/move - Move a post to another category (admin/moderator only)
   */
  @Put(':id/move')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async move(
    @Param('id', ParseIntPipe) id: number,
    @Body('category_id', ParseIntPipe) categoryId: number,
    @Req() req: any,
  ) {
    const post = await this.postsService.move(id, categoryId);
    await this.logOperation(req, 'post.move', 'post', id, { category_id: categoryId });
    return post;
  }

  /**
   * GET /api/posts/user/:userId - Get posts by user
   */
  @Get('user/:userId')
  async findByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: QueryPostPageDto,
  ) {
    return this.postsService.findByUser(userId, query.page ?? 1, query.limit ?? 20);
  }

  private async logOperation(
    req: any,
    action: string,
    targetType?: string,
    targetId?: number,
    details?: Record<string, unknown>,
  ) {
    await this.logsService.log({
      user_id: req.user?.id,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details ? JSON.stringify(details) : undefined,
      ip_address: this.getClientIp(req),
      user_agent: req.headers?.['user-agent'],
    }).catch((err) => console.warn('operation log failed:', err.message));
  }

  private getClientIp(req: any): string {
    return getClientIp(req);
  }
}
