import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { OAuthScopeGuard } from '../../common/guards/oauth-scope.guard';
import { RequireOAuthScopes } from '../../common/decorators/require-oauth-scopes.decorator';

@ApiV1()
@ApiTags('v1-search')
@Controller('v1/search')
export class SearchV1Controller {
  constructor(private readonly search: SearchService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @UseGuards(OAuthScopeGuard)
  @RequireOAuthScopes('forum.read')
  @RateLimit({ max: 30, window: 60 })
  async unified(@Query() query: SearchQueryDto, @Req() req: any) {
    return this.search.withSearchAudit(req.user, query.q, async (normalized) => {
      const value = await this.search.searchUnified(normalized, req.user, query.limit);
      return {
        value,
        resultsCount: Object.values(value.total_by_type).reduce((total, count) => total + count, 0),
      };
    });
  }

  @Get('posts')
  @UseGuards(JwtAuthGuard)
  @UseGuards(OAuthScopeGuard)
  @RequireOAuthScopes('forum.read')
  @RateLimit({ max: 30, window: 60 })
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
