import { Controller, Get, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query() dto: SearchQueryDto) {
    const postsResult = await this.searchService.searchPosts(dto.q, {
      page: dto.page,
      limit: dto.limit,
      category: dto.category,
      sort: dto.sort,
    });

    // Record search
    await this.searchService.recordSearch(undefined, dto.q, postsResult.pagination.total);

    return {
      ...postsResult,
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
