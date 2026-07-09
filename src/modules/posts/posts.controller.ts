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
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { LogsService } from '../logs/logs.service';

@Controller('posts')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly logsService: LogsService,
  ) {}

  /**
   * GET /api/posts - List posts (page-based pagination)
   */
  @Get()
  async findAll(@Query() query: QueryPostsDto) {
    return this.postsService.findAll(query);
  }

  /**
   * GET /api/posts/cursor - List posts (cursor-based pagination)
   */
  @Get('cursor')
  async findAllCursor(@Query() query: QueryPostsDto) {
    return this.postsService.findAllCursor(query);
  }

  /**
   * GET /api/posts/trending - Get trending posts
   */
  @Get('trending')
  async getTrending(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.postsService.getTrending(limit || 10);
  }

  /**
   * GET /api/posts/pinned - Get pinned posts
   */
  @Get('pinned')
  async getPinned(@Query('category_id', new ParseIntPipe({ optional: true })) categoryId?: number) {
    return this.postsService.getPinned(categoryId);
  }

  /**
   * GET /api/posts/search - Search posts
   */
  @Get('search')
  async search(
    @Query('q') query: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return this.postsService.search(query.trim(), limit || 20);
  }

  /**
   * GET /api/posts/:id - Get post detail with replies
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('reply_page') replyPage?: string,
    @Query('reply_limit') replyLimit?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
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
    const post = await this.postsService.findById(id);
    const replies = await this.postsService.getReplies(
      id,
      Number.isFinite(parsedReplyLimit) ? parsedReplyLimit : 20,
      Number.isFinite(parsedReplyPage) ? parsedReplyPage : 1,
    );

    return {
      ...post,
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
  async create(@Body() dto: CreatePostDto, @Req() req: any) {
    const userId = req.user.id;
    const post = await this.postsService.create(dto, userId);
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
    return { success: true, message: '帖子删除成功' };
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
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.postsService.findByUser(userId, page || 1, limit || 20);
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
    return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  }
}
