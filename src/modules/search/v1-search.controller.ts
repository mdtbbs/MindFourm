import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { OAuthProtected } from '../../common/decorators/oauth-protected.decorator';
import { SearchSuggestionsQueryDto } from './dto/search-suggestions-query.dto';

@ApiV1()
@ApiTags('v1-search')
@Controller('v1/search')
export class SearchV1Controller {
  constructor(private readonly search: SearchService) {}

  @Get('suggestions')
  @OAuthProtected('forum.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiQuery({ name: 'q', required: true, type: String, schema: { minLength: 2, maxLength: 64 }, example: 'mindustry', description: '从聚合热门词中返回有界、公开的搜索建议。' })
  suggestions(@Query() query: SearchSuggestionsQueryDto) {
    return this.search.getSearchSuggestions(query.q, 8);
  }

  @Get()
  @OAuthProtected('forum.read')
  @RateLimit({ max: 30, window: 60 })
  @ApiQuery({ name: 'q', required: true, type: String, schema: { maxLength: 255 }, example: '资源更新', description: '搜索关键词。' })
  @ApiQuery({ name: 'type', required: false, enum: ['all', 'posts', 'resources', 'mod', 'map', 'schematic', 'users', 'servers', 'wiki', 'game_versions', 'developer_feed'], example: 'all', description: '结果分组筛选。' })
  @ApiQuery({ name: 'category', required: false, type: String, example: 'discussion', description: '分类筛选标识。' })
  @ApiQuery({ name: 'sort', required: false, enum: ['relevance', 'newest', 'oldest', 'downloads', 'rating'], example: 'relevance', description: '结果排序方式。' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: '结果页码，从 1 开始。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 100 }, example: 20, description: '每页结果数量。' })
  @ApiQuery({ name: 'content_language', required: false, enum: ['en', 'ru', 'ja', 'zh-CN'], example: 'zh-CN', description: '资源和帖子内容语言筛选。' })
  @ApiQuery({ name: 'resource_kind', required: false, enum: ['mod', 'map', 'schematic'], description: '资源子类型筛选。' })
  async unified(@Query() query: SearchQueryDto, @Req() req: any) {
    return this.search.withSearchAudit(req.user, query.q, async (normalized) => {
      const value = await this.search.searchUnifiedWithSuggestion(normalized, req.user, query);
      return {
        value,
        resultsCount: Object.values(value.total_by_type).reduce((total, count) => total + count, 0),
      };
    });
  }

  @Get('posts')
  @OAuthProtected('forum.read')
  @RateLimit({ max: 30, window: 60 })
  @ApiQuery({ name: 'q', required: true, type: String, schema: { maxLength: 255 }, example: '资源更新', description: '搜索关键词。' })
  @ApiQuery({ name: 'type', required: false, enum: ['post'], example: 'post', description: '搜索类型；此端点固定返回帖子结果。' })
  @ApiQuery({ name: 'category', required: false, type: String, example: 'discussion', description: '分类筛选标识。' })
  @ApiQuery({ name: 'sort', required: false, enum: ['relevance', 'newest', 'oldest'], example: 'relevance', description: '结果排序方式。' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: '结果页码，从 1 开始。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 100 }, example: 20, description: '每页结果数量。' })
  async posts(@Query() query: SearchQueryDto, @Req() req: any) {
    return this.search.withSearchAudit(req.user, query.q, async (normalized) => {
      const result = await this.search.searchPosts(normalized, query, req.user);
      return {
        value: {
          items: result.data,
          __v1Pagination: {
            page: result.pagination.page,
            limit: result.pagination.limit,
            total: result.pagination.total,
            total_pages: result.pagination.totalPages,
          },
        },
        resultsCount: result.pagination.total,
      };
    });
  }
}
