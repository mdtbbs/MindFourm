import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OAuthOptionalProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { ResourceDiscoveryService } from './resource-discovery.service';

@ApiV1()
@ApiTags('v1-resource-discovery')
@Controller('v1/resources/discovery')
export class ResourceDiscoveryController {
  constructor(private readonly discovery: ResourceDiscoveryService) {}

  @Get('home')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ operationId: 'getResourceDiscoveryHome', summary: '资源中心运营首页：精选、趋势、上升、评分榜和最新资源' })
  @ApiQuery({ name: 'kind', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 4, maximum: 20 } })
  home(@Query('kind') kind?: string, @Query('limit') limit?: string) {
    return this.discovery.home(kind, Number(limit));
  }

  @Get('for-you')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 45, window: 60 })
  @ApiOperation({ operationId: 'getResourceRecommendationsForYou', summary: '获取可解释的资源推荐；匿名用户回退到趋势推荐' })
  @ApiQuery({ name: 'kind', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 30 } })
  forYou(@Req() request: any, @Query('kind') kind?: string, @Query('limit') limit?: string) {
    return this.discovery.forYou(request.user?.id, kind, Number(limit));
  }

  @Get('related/:id')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ operationId: 'getRelatedResources', summary: '根据资源类型、分类、标签和质量信号获取相关推荐' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 24 } })
  related(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.discovery.related(id, Number(limit));
  }
}
