import { Controller, Get, Param, ParseIntPipe, Query, HttpStatus, Req, Optional } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { ApiV1Exception } from '../../../common/exceptions/api-v1.exception';
import { ThreadReadAdapterService, V1ThreadDto } from '../thread-read-adapter.service';
import { PostsService } from '../../posts/posts.service';
import { QueryThreadsV1Dto } from './query-threads-v1.dto';
import { OptionalAuth } from '../../../common/decorators/public.decorator';
import { LikesService } from '../../likes/likes.service';
import { BookmarksService } from '../../bookmarks/bookmarks.service';
import { OAuthOptionalProtected } from '../../../common/decorators/oauth-protected.decorator';
import { SearchService } from '../../search/search.service';
import { POST_SOURCES } from '../../../entities/post.entity';
import { THREAD_CURSOR_ITEM_SCHEMA, THREAD_DETAIL_SCHEMA, THREAD_LIST_ITEM_SCHEMA, THREAD_REPLY_SCHEMA } from './thread-v1.openapi';

@ApiV1()
@ApiTags('v1-threads')
@Controller('v1/threads')
export class ThreadsV1Controller {
  constructor(
    private readonly threadAdapter: ThreadReadAdapterService,
    private readonly postsService?: PostsService,
    private readonly likesService?: LikesService,
    private readonly bookmarksService?: BookmarksService,
    @Optional() private readonly searchService?: SearchService,
  ) {}

  @Get()
  @OptionalAuth()
  @OAuthOptionalProtected('forum.read')
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 50 }, example: 20, description: '每页最多返回条数，默认 20、上限 50。' })
  @ApiQuery({ name: 'offset', required: false, type: Number, schema: { minimum: 0 }, example: 0, description: '传统分页的起始偏移量；不传时由 page 计算。' })
  @ApiQuery({ name: 'category_id', required: false, type: Number, schema: { minimum: 1 }, example: 2, description: '按论坛分类 ID 筛选。' })
  @ApiQuery({ name: 'page', required: false, type: Number, schema: { minimum: 1 }, example: 1, description: 'offset 模式中用于计算起始位置的页码；q 搜索时作为结果页码。' })
  @ApiQuery({ name: 'q', required: false, type: String, schema: { maxLength: 200 }, example: '建筑', description: '按帖子标题和正文搜索；此模式使用 page/limit 分页。' })
  @ApiQuery({ name: 'sort', required: false, type: String, example: 'newest', description: 'q 搜索可用 relevance、newest、oldest；cursor 列表可用 created_at、updated_at、view_count、like_count。' })
  @ApiQuery({ name: 'cursor', required: false, type: String, example: 'CURSOR_FROM_PREVIOUS_PAGE', description: '启用 cursor 分页并传入上一页 data.next_cursor；首次 cursor 请求传空 cursor。与 offset/page 搜索模式分开使用。' })
  @ApiQuery({ name: 'source', required: false, enum: [...POST_SOURCES], example: 'USER', description: 'cursor 模式下按帖子来源筛选。' })
  @ApiQuery({ name: 'exclude_category_ids', required: false, type: String, example: '3,4', description: 'cursor 模式下排除分类 ID，多个 ID 用逗号分隔。' })
  @ApiQuery({ name: 'user_id', required: false, type: Number, schema: { minimum: 1 }, example: 45, description: 'cursor 模式下只读取指定作者的讨论。' })
  @ApiQuery({ name: 'content_language', required: false, type: String, schema: { maxLength: 16 }, example: 'zh-CN', description: 'cursor 模式下按作者声明的内容语言筛选。' })
  @ApiQuery({ name: 'server_id', required: false, type: Number, schema: { minimum: 1 }, example: 7, description: 'cursor 模式下按关联游戏服务器筛选。' })
  @ApiQuery({ name: 'order', required: false, enum: ['ASC', 'DESC'], example: 'DESC', description: 'cursor 模式排序方向；默认 DESC。' })
  @ApiOkResponse({
    description: 'offset / 搜索模式返回讨论数组和 meta.pagination；cursor 模式返回 items、next_cursor、has_more。',
    schema: { oneOf: [
      { type: 'array', items: THREAD_LIST_ITEM_SCHEMA },
      { type: 'object', required: ['items', 'next_cursor', 'has_more'], properties: {
        items: { type: 'array', items: THREAD_CURSOR_ITEM_SCHEMA, description: '当前页讨论摘要。' },
        next_cursor: { type: 'string', nullable: true, example: 'NEXT_CURSOR', description: '下一页游标；为 null 表示没有下一页。' },
        has_more: { type: 'boolean', example: true, description: '是否还有下一页。' },
      } },
    ] },
  })
  async listThreads(
    @Query() query: QueryThreadsV1Dto,
    @Req() req: any,
  ): Promise<V1ThreadDto[] | { items: unknown[]; next_cursor: string | null; has_more: boolean }> {
    // `offset` keeps the already-published read contract intact. Android sends
    // `cursor` and receives the richer cursor form below.
    if (query.cursor !== undefined) {
      const result = await this.postsService!.findAllCursor(query, req.user);
      return { items: result.data, next_cursor: result.nextCursor, has_more: result.hasMore };
    }
    const limit = Math.min(Number(query.limit || 20), 50);
    const offset = Math.max(0, parseInt(query.offset || String(((query.page || 1) - 1) * limit), 10) || 0);
    if (query.q?.trim()) {
      if (!this.searchService) throw new ApiV1Exception('SEARCH_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '搜索服务暂不可用', true);
      const result = await this.searchService.searchPosts(query.q.trim(), {
        page: query.page || Math.floor(offset / limit) + 1,
        limit,
        categoryId: query.category_id,
        sort: query.sort,
      }, req.user);
      const items = result.data.map((post: any) => ({
        public_id: null, id: post.id, title: post.title, slug: post.slug, status: post.status,
        is_pinned: post.is_pinned, is_locked: post.is_locked, view_count: post.view_count,
        reply_count: post.reply_count, created_at: new Date(post.created_at).toISOString(),
        updated_at: new Date(post.updated_at).toISOString(), category_id: post.category_id,
        user_id: post.user_id,
        author: post.author_name ? { id: post.user_id, username: post.author_name, avatar_url: post.author_avatar_url } : null,
        category: post.category_name ? { id: post.category_id, name: post.category_name, slug: post.category_slug } : null,
        excerpt: post.excerpt,
      }));
      return this.withPagination(items, {
        page: result.pagination.page, limit: result.pagination.limit, total: result.pagination.total,
        total_pages: result.pagination.totalPages, has_more: result.pagination.page < result.pagination.totalPages,
      });
    }
    const items = await this.threadAdapter.listThreadsV1({ limit, offset, categoryId: query.category_id });
    const total = await this.threadAdapter.countThreadsV1(query.category_id);
    const pages = Math.ceil(total / limit);
    return this.withPagination(items, { page: Math.floor(offset / limit) + 1, limit, total, total_pages: pages, has_more: offset + items.length < total });
  }

  @Get(':id')
  @OptionalAuth()
  @OAuthOptionalProtected('forum.read')
  @ApiOkResponse({ description: '讨论详情及当前查看者状态。', schema: THREAD_DETAIL_SCHEMA })
  async getThread(@Param('id', new ParseIntPipe()) id: number, @Req() req?: any): Promise<V1ThreadDto | unknown> {
    // Existing tests and isolated adapter consumers retain the old minimal form;
    // the running module returns that stable shape plus additive detail fields.
    const thread = await this.threadAdapter.getThreadV1(id);
    if (!thread) throw new ApiV1Exception('THREAD_NOT_FOUND', HttpStatus.NOT_FOUND, '讨论不存在或不可见', false);
    if (!this.postsService) return thread;
    const [detail, replies] = await Promise.all([
      this.postsService.findById(id, req?.user),
      this.postsService.getReplies(id, 50, 1),
    ]);
    const userId = req?.user?.id;
    const viewer = userId && this.likesService && this.bookmarksService
      ? {
        liked: await this.likesService.isPostLiked(userId, id),
        bookmarked: await this.bookmarksService.check(userId, id),
      }
      : null;
    return {
      ...thread,
      ...detail,
      viewer,
      is_owner: userId === detail.user_id,
      // The server remains the authority for all mutations. This additive flag
      // merely lets a first-party client present edit/delete controls without
      // having to fetch and compare profile data itself.
      replies: replies.data.map((reply: any) => ({
        ...reply,
        is_owner: userId === reply.user_id,
      })),
      reply_pagination: {
        total: replies.total,
        page: replies.page,
        limit: replies.limit,
        total_pages: replies.totalPages,
      },
    };
  }

  @Get(':id/replies')
  @OptionalAuth()
  @OAuthOptionalProtected('forum.read')
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: '回复页码，从 1 开始。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: '每页回复数，服务端限制为 1–50。' })
  @ApiOkResponse({ description: '回复数组；分页信息放在 meta.pagination。', schema: { type: 'array', items: {
    ...THREAD_REPLY_SCHEMA,
    properties: { ...THREAD_REPLY_SCHEMA.properties, is_owner: { type: 'boolean', example: false, description: '当前用户是否为该回复作者。' } },
    required: [...THREAD_REPLY_SCHEMA.required, 'is_owner'],
  } } })
  async getReplies(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') pageText = '1',
    @Query('limit') limitText = '20',
    @Req() req?: any,
  ) {
    const thread = await this.threadAdapter.getThreadV1(id);
    if (!thread) throw new ApiV1Exception('THREAD_NOT_FOUND', HttpStatus.NOT_FOUND, '讨论不存在或不可见', false);
    if (!this.postsService) throw new ApiV1Exception('REPLIES_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '回复暂不可用', true);
    const page = Math.max(1, Number.parseInt(pageText, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(limitText, 10) || 20));
    const result = await this.postsService.getReplies(id, limit, page);
    const items = result.data.map((reply: any) => ({ ...reply, is_owner: req?.user?.id === reply.user_id }));
    return this.withPagination(items, {
      page: result.page, limit: result.limit, total: result.total,
      total_pages: result.totalPages, has_more: result.page < result.totalPages,
    });
  }

  private withPagination<T>(items: T[], pagination: { page: number; limit: number; total: number; total_pages: number; has_more: boolean }): T[] {
    Object.defineProperty(items, '__v1Pagination', { value: pagination, enumerable: false });
    return items;
  }
}
