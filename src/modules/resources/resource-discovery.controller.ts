import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OAuthOptionalProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { ResourceDiscoveryService } from './resource-discovery.service';

@ApiV1()
@ApiTags('Resources - Discovery')
@Controller('v1/resources/discovery')
export class ResourceDiscoveryController {
  constructor(private readonly discovery: ResourceDiscoveryService) {}

  @Get('home')
  @ApiOperation({ summary: '获取资源中心发现页推荐分组', description: '返回精选、趋势、近期上升、最高评分和最新资源分组，可按资源类型过滤。' })
  @ApiQuery({ name: 'kind', required: false, description: '资源类型，例如 schematic、map、mod、pack。' })
  @ApiQuery({ name: 'limit', required: false, description: '每个推荐分组的返回数量。', schema: { type: 'integer', minimum: 1, maximum: 24, default: 12 } })
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  home(@Query('kind') kind?: string, @Query('limit') limit?: string) {
    return this.discovery.home(kind, Number(limit));
  }

  @Get('for-you')
  @ApiOperation({ summary: '获取个性化资源推荐', description: '登录用户会依据点赞和收藏生成轻量兴趣画像；匿名或无足够行为数据时安全回退到趋势资源。' })
  @ApiQuery({ name: 'kind', required: false, description: '资源类型过滤。' })
  @ApiQuery({ name: 'limit', required: false, description: '返回数量。', schema: { type: 'integer', minimum: 1, maximum: 24, default: 12 } })
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 45, window: 60 })
  forYou(@Req() request: any, @Query('kind') kind?: string, @Query('limit') limit?: string) {
    return this.discovery.forYou(request.user?.id, kind, Number(limit));
  }

  @Get('related/:id')
  @ApiOperation({ summary: '获取相关资源', description: '按资源类型、分类、标签及质量信号计算相关推荐，并返回可解释的推荐理由。' })
  @ApiParam({ name: 'id', description: '资源 public_id。' })
  @ApiQuery({ name: 'limit', required: false, description: '返回数量。', schema: { type: 'integer', minimum: 1, maximum: 24, default: 12 } })
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  related(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.discovery.related(id, Number(limit));
  }
}
