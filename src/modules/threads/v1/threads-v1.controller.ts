import { Controller, Get, Param, ParseIntPipe, Query, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { ApiV1Exception } from '../../../common/exceptions/api-v1.exception';
import { ThreadReadAdapterService, V1ThreadDto } from '../thread-read-adapter.service';
import { PostsService } from '../../posts/posts.service';
import { QueryThreadsV1Dto } from './query-threads-v1.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { OptionalAuth } from '../../../common/decorators/public.decorator';
import { LikesService } from '../../likes/likes.service';
import { BookmarksService } from '../../bookmarks/bookmarks.service';

@ApiV1()
@ApiTags('v1-threads')
@Controller('v1/threads')
export class ThreadsV1Controller {
  constructor(
    private readonly threadAdapter: ThreadReadAdapterService,
    private readonly postsService?: PostsService,
    private readonly likesService?: LikesService,
    private readonly bookmarksService?: BookmarksService,
  ) {}

  @Get()
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'category_id', required: false, type: Number })
  @ApiOkResponse({ description: 'List of threads' })
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
    return this.threadAdapter.listThreadsV1({
      limit: Math.min(Number(query.limit || 20), 50),
      offset: parseInt(query.offset || '0', 10),
      categoryId: query.category_id,
    });
  }

  @Get(':id')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Thread detail' })
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
}
