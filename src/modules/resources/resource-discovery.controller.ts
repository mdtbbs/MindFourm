import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OAuthOptionalProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { ResourceDiscoveryService } from './resource-discovery.service';
import { ResourceDiscoveryHomeEnvelopeDto, ResourceDiscoveryHomeQueryDto, ResourceDiscoveryHotEnvelopeDto, ResourceDiscoveryHotQueryDto, ResourceDiscoveryQueryDto, ResourceDiscoveryRecommendationsEnvelopeDto, ResourceDiscoveryRelatedEnvelopeDto, ResourceDiscoveryRelatedQueryDto, ResourceDiscoveryV1ErrorEnvelopeDto } from './resource-discovery.dto';

@ApiV1()
@Controller('v1/resources/discovery')
export class ResourceDiscoveryController {
  constructor(private readonly discovery: ResourceDiscoveryService) {}

  @Get('home')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ summary: '读取资源发现榜单', description: '匿名访问可用；携带 MindAuth Bearer 时需要 resource.read。返回精选、趋势、近 7 日上升、评分榜与最新榜，排除删除、未审核、私有和停用主题资源。每个榜单给出理由和限定候选窗口内的分页信息；候选窗口达到上限时可能仍有未扫描结果。' })
  @ApiQuery({ name: 'kind', required: false, enum: ['mod', 'schematic', 'map', 'other'], description: '按资源类型筛选。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { type: 'integer', minimum: 1, maximum: 20 }, example: 8, description: '每个榜单返回条数。' })
  @ApiQuery({ name: 'page', required: false, type: Number, schema: { type: 'integer', minimum: 1, maximum: 400 }, example: 1, description: '一基页码，按每个榜单的排序结果分页。' })
  @ApiOkResponse({ type: ResourceDiscoveryHomeEnvelopeDto })
  @ApiBadRequestResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: 'kind、limit 或 page 不符合契约。' })
  @ApiUnauthorizedResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: '提交了无法验证的登录凭证。' })
  @ApiForbiddenResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: 'Bearer token 缺少 resource.read scope。' })
  home(@Query() query: ResourceDiscoveryHomeQueryDto) {
    return this.discovery.home(query.kind, query.limit, query.page);
  }

  @Get('hot')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ summary: '读取下载量最高的公开资源', description: '匿名访问可用；携带 MindAuth Bearer 时需要 resource.read。排除删除、未审核、私有和停用主题资源；返回理由、下载计分和最多 300 个候选的分页状态。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { type: 'integer', minimum: 1, maximum: 30 }, example: 10 })
  @ApiQuery({ name: 'page', required: false, type: Number, schema: { type: 'integer', minimum: 1, maximum: 400 }, example: 1 })
  @ApiOkResponse({ type: ResourceDiscoveryHotEnvelopeDto })
  @ApiBadRequestResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: 'limit 或 page 不符合契约。' })
  @ApiUnauthorizedResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: '提交了无法验证的登录凭证。' })
  @ApiForbiddenResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: 'Bearer token 缺少 resource.read scope。' })
  hot(@Query() query: ResourceDiscoveryHotQueryDto) {
    return this.discovery.hot(query.limit, query.page);
  }

  @Get('for-you')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 45, window: 60 })
  @ApiOperation({ summary: '读取猜你喜欢资源', description: '匿名访问可用。匿名或无可见偏好时返回非个性化趋势榜；登录且携带有效 Bearer 时需要 resource.read。排除删除、未审核、私有和停用主题资源。个性化仅使用当前公开资源中的站内点赞/收藏，并排除这些种子本身。响应包含 reasons、score 和候选窗口分页，不使用外部浏览行为。' })
  @ApiQuery({ name: 'kind', required: false, enum: ['mod', 'schematic', 'map', 'other'] })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { type: 'integer', minimum: 1, maximum: 30 }, example: 12 })
  @ApiQuery({ name: 'page', required: false, type: Number, schema: { type: 'integer', minimum: 1, maximum: 400 }, example: 1 })
  @ApiOkResponse({ type: ResourceDiscoveryRecommendationsEnvelopeDto })
  @ApiBadRequestResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: 'kind、limit 或 page 不符合契约。' })
  @ApiUnauthorizedResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: '提交了无法验证的登录凭证。' })
  @ApiForbiddenResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: 'Bearer token 缺少 resource.read scope。' })
  forYou(@Req() request: any, @Query() query: ResourceDiscoveryQueryDto) {
    return this.discovery.forYou(request.user?.id, query.kind, query.limit, query.page);
  }

  @Get('related/:id')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ summary: '读取相关推荐资源', description: '匿名访问可用；携带 MindAuth Bearer 时需要 resource.read。源资源本身必须当前公开，否则返回 404，避免泄露私密资源状态。返回当前公开、审核通过且未关联停用主题的候选资源、解释理由与限定候选窗口分页。' })
  @ApiParam({ name: 'id', format: 'uuid', description: '当前公开 Resource 的 public_id。' })
  @ApiQuery({ name: 'limit', required: false, type: Number, schema: { type: 'integer', minimum: 1, maximum: 24 }, example: 8 })
  @ApiQuery({ name: 'page', required: false, type: Number, schema: { type: 'integer', minimum: 1, maximum: 400 }, example: 1 })
  @ApiOkResponse({ type: ResourceDiscoveryRelatedEnvelopeDto })
  @ApiBadRequestResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: '源资源 ID 不是 UUID，或 limit/page 不符合契约。' })
  @ApiUnauthorizedResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: '提交了无法验证的登录凭证。' })
  @ApiForbiddenResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: 'Bearer token 缺少 resource.read scope。' })
  @ApiNotFoundResponse({ type: ResourceDiscoveryV1ErrorEnvelopeDto, description: '源资源不存在或当前不可公开访问。' })
  related(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: ResourceDiscoveryRelatedQueryDto) {
    return this.discovery.related(id, query.limit, query.page);
  }
}
