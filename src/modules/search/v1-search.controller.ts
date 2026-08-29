import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

@ApiV1()
@ApiTags('v1-search')
@Controller('v1/search')
export class SearchV1Controller {
  constructor(private readonly search: SearchService) {}
  @Get('posts')
  async posts(@Query() query: SearchQueryDto) {
    const result = await this.search.searchPosts(query.q, query);
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
