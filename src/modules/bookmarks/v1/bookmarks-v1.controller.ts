import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
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
@UseGuards(JwtAuthGuard)
export class BookmarksV1Controller {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'The current user\'s bookmarked thread summaries.' })
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
