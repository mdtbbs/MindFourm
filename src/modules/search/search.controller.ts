import { Controller, Get, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuth } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  // Optional auth so a signed-in searcher's history can actually be attributed to
  // them; the route stays open to anonymous callers.
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  // Search runs `content LIKE '%…%'`, which is a table scan.
  @RateLimit({ max: 30, window: 60 })
  async search(@Query() dto: SearchQueryDto, @Req() req: any) {
    const [postsResult, resources] = await Promise.all([
      this.searchService.searchPosts(dto.q, {
        page: dto.page,
        limit: dto.limit,
        category: dto.category,
        sort: dto.sort,
      }),
      this.searchService.searchResources(dto.q, 20),
    ]);

    // A global search is useful when it finds either a forum post or a resource.
    // Recording only the post total made an otherwise useful resource-only query
    // look like a zero-result search in user history and admin analytics.
    await this.searchService.recordSearch(
      req?.user?.id,
      dto.q,
      postsResult.pagination.total + resources.length,
    );

    return {
      ...postsResult,
      resources,
      popular_searches: await this.searchService.getPopularSearches(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getHistory(@Req() req: any) {
    return this.searchService.getSearchHistory(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('history')
  async clearHistory(@Req() req: any) {
    await this.searchService.clearSearchHistory(req.user.id);
    return { message: 'Search history cleared' };
  }

  @Get('popular')
  async getPopular() {
    return this.searchService.getPopularSearches();
  }
}
