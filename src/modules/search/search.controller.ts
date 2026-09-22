import { Controller, Get, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  // Search runs `content LIKE '%…%'`, which is a table scan.
  @RateLimit({ max: 30, window: 60 })
  async search(@Query() dto: SearchQueryDto, @Req() req: any) {
    return this.searchService.withSearchAudit(req.user, dto.q, async (query) => {
      const [postsResult, resources] = await Promise.all([
        this.searchService.searchPosts(query, {
          page: dto.page,
          limit: dto.limit,
          category: dto.category,
          sort: dto.sort,
        }, req.user),
        this.searchService.searchResources(query, 20),
      ]);

      return {
        value: {
          ...postsResult,
          resources,
          popular_searches: await this.searchService.getPopularSearches(),
        },
        resultsCount: postsResult.pagination.total + resources.length,
      };
    });
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
