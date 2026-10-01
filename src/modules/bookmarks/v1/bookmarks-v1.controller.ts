import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { OAuthProtected } from '../../../common/decorators/oauth-protected.decorator';
import { BookmarksService } from '../bookmarks.service';

/**
 * First-party mobile read surface for the current user's bookmarks.
 *
 * The legacy controller returns its own nested envelope. This controller keeps
 * the global V1 response envelope and projects bookmarks to the same thread
 * summary shape used by the Android client.
 */
@ApiV1()
@ApiTags('v1-bookmarks')
@Controller('v1/me/bookmarks')
export class BookmarksV1Controller {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  @OAuthProtected('forum.read')
  @ApiQuery({ name: 'page', required: false, type: Number, schema: { minimum: 1 }, example: 1, description: '结果页码，从 1 开始；默认 1。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 50 }, example: 20, description: '每页书签数；默认 20，最大 50。' })
  @ApiOkResponse({ description: '当前用户收藏的讨论摘要和分页。', schema: { type: 'object', required: ['items', 'pagination'], properties: {
    items: { type: 'array', description: '当前页收藏讨论。', items: { type: 'object', required: ['id', 'title', 'excerpt', 'user_id', 'author_name', 'author_avatar_url', 'category_id', 'category_name', 'category_slug', 'reply_count', 'view_count', 'created_at', 'updated_at', 'tags'], properties: {
      id: { type: 'integer', example: 123, description: '讨论 ID。' },
      title: { type: 'string', example: '新手建筑布局分享', description: '讨论标题。' },
      excerpt: { type: 'string', nullable: true, example: '分享一套适合新手的布局……', description: '纯文本摘要。' },
      user_id: { type: 'integer', example: 45, description: '作者论坛用户 ID。' },
      author_name: { type: 'string', example: 'builder', description: '作者用户名。' },
      author_avatar_url: { type: 'string', nullable: true, example: null, description: '作者头像 URL。' },
      category_id: { type: 'integer', nullable: true, example: 2, description: '分类 ID。' },
      category_name: { type: 'string', nullable: true, example: '交流', description: '分类名称。' },
      category_slug: { type: 'string', nullable: true, example: 'discussion', description: '分类 URL slug。' },
      reply_count: { type: 'integer', example: 8, description: '回复数。' },
      view_count: { type: 'integer', example: 245, description: '浏览次数。' },
      created_at: { type: 'string', format: 'date-time', example: '2026-09-30T12:00:00.000Z', description: '发帖时间。' },
      updated_at: { type: 'string', format: 'date-time', example: '2026-09-30T12:30:00.000Z', description: '最后更新时间。' },
      tags: { type: 'array', items: { type: 'string' }, example: [], description: '帖子标签；当前收藏摘要返回空数组。' },
    } } },
    pagination: { type: 'object', required: ['page', 'limit', 'total', 'total_pages'], description: '分页信息，也会同步放入响应 meta.pagination。', properties: {
      page: { type: 'integer', example: 1, description: '当前页。' },
      limit: { type: 'integer', example: 20, description: '每页条数。' },
      total: { type: 'integer', example: 37, description: '匹配的收藏总数。' },
      total_pages: { type: 'integer', example: 2, description: '总页数。' },
    } },
  } } })
  async list(@Req() req: any, @Query('page') rawPage?: string, @Query('limit') rawLimit?: string) {
    const page = normalizePositiveInt(rawPage, 1, 1, Number.MAX_SAFE_INTEGER);
    const limit = normalizePositiveInt(rawLimit, 20, 1, 50);
    const result = await this.bookmarks.getByUserId(req.user.id, page, limit);
    const items = result.bookmarks.flatMap((bookmark: any) => {
      const post = bookmark.post;
      if (!post) return [];
      return [{
        id: post.id,
        title: post.title,
        excerpt: excerpt(post.content),
        user_id: post.user_id,
        author_name: post.user?.username ?? '未知用户',
        author_avatar_url: post.user?.avatar_url ?? null,
        category_id: post.category_id ?? null,
        category_name: post.category?.name ?? null,
        category_slug: post.category?.slug ?? null,
        reply_count: 0,
        view_count: post.view_count ?? 0,
        created_at: post.created_at?.toISOString?.() ?? null,
        updated_at: post.updated_at?.toISOString?.() ?? null,
        tags: [],
      }];
    });
    return {
      items,
      pagination: {
        page,
        limit,
        total: result.total,
        total_pages: Math.ceil(result.total / limit),
      },
    };
  }
}

function normalizePositiveInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min ? Math.min(parsed, max) : fallback;
}

function excerpt(content: unknown) {
  return String(content ?? '').replace(/\s+/g, ' ').trim().slice(0, 180) || null;
}
