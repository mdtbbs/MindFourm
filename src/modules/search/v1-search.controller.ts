import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { OptionalAuth } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiV1()
@ApiTags('v1-search')
@Controller('v1/search')
export class SearchV1Controller {
  constructor(private readonly search: SearchService) {}

  @Get()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async unified(@Query() query: SearchQueryDto, @Req() req: any) {
    return this.search.searchUnified(query.q, req?.user, query.limit);
  }

  @Get('posts')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async posts(@Query() query: SearchQueryDto, @Req() req: any) {
    const result = await this.search.searchPosts(query.q, query, req?.user);
    return {
      items: result.data,
      __v1Pagination: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        total_pages: result.pagination.totalPages,
      },
    };
  }
}
