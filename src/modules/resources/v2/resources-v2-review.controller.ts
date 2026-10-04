import { Body, Controller, Delete, Get, Param, Post, Query, Req, ValidationPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBody, ApiCreatedResponse, ApiExtraModels, ApiForbiddenResponse,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags,
  ApiUnauthorizedResponse, getSchemaPath,
} from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OAuthProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import {
  ResourceV2ClearFindingOverrideDto, ResourceV2FindingOverrideDto, ResourceV2FindingOverrideResponseDto,
  ResourceV2ReviewAnnotationDto, ResourceV2ReviewAnnotationResponseDto,
  ResourceV2ReviewTimelineQueryDto, ResourceV2ReviewTimelineResponseDto,
} from './resources-v2-review.dto';
import { ResourceV2ApiErrorEnvelopeDto, ResourceV2ApiMetaDto } from './resources-v2.dto';
import { ResourceV2ReviewService } from './resource-v2-review.service';

const REVIEW_REQUEST_ID = 'req_01J9XZ4B9Y4Y8V1JXK5Z7Q0W12';

function reviewSuccessSchema(dto: Function, data: Record<string, unknown>) {
  return {
    allOf: [{
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: { $ref: getSchemaPath(dto as any) },
        meta: { $ref: getSchemaPath(ResourceV2ApiMetaDto) },
      },
    }],
    example: { data, meta: { request_id: REVIEW_REQUEST_ID } },
  };
}

function reviewErrorExample(code: string, message: string) {
  return {
    error: {
      code,
      message,
      retryable: false,
      details: [],
      documentation_url: `https://mdtbbs.cn/api/v1/docs/errors#${code.toLowerCase().replaceAll('_', '-')}`,
    },
    meta: { request_id: REVIEW_REQUEST_ID },
  };
}

@ApiV1()
@ApiTags('v1-resources-v2-review')
@Controller('v1/resources')
export class ResourcesV2ReviewController {
  constructor(private readonly review: ResourceV2ReviewService) {}

  @Get(':id/review-events')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ operationId: 'listResourceReviewEventsV2', summary: '读取有权限访问的 Resource 审核时间线', description: '仅 Resource owner、active member、管理员或版主可读。响应不包含数据库内部数值 ID。' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiQuery({ name: 'version_public_id', required: false, schema: { format: 'uuid' } })
  @ApiQuery({ name: 'limit', required: false, schema: { minimum: 1, maximum: 100 }, example: 50 })
  @ApiQuery({ name: 'offset', required: false, schema: { minimum: 0, maximum: 100_000 }, example: 0 })
  @ApiExtraModels(ResourceV2ReviewTimelineResponseDto, ResourceV2ApiMetaDto, ResourceV2ApiErrorEnvelopeDto)
  @ApiOkResponse({ description: '审核事件、字段批注、操作者、时间戳和适用的 parser_version。', schema: reviewSuccessSchema(ResourceV2ReviewTimelineResponseDto, { items: [], pagination: { limit: 50, offset: 0, has_more: false } }) })
  @ApiBadRequestResponse({ description: 'Resource/version public UUID 或分页参数无效。', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('BAD_REQUEST', '审核时间线参数无效。') })
  @ApiUnauthorizedResponse({ description: '需要有效的 MindAuth access token 或 MDTBBS 登录会话。', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('UNAUTHORIZED', '需要登录。') })
  @ApiForbiddenResponse({ description: '当前账号不是该 Resource 成员或审核人员。', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('FORBIDDEN', '无权读取审核时间线。') })
  @ApiNotFoundResponse({ description: 'Resource 或指定版本不存在。', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('RESOURCE_NOT_FOUND', '资源不存在或不可见。') })
  @OAuthProtected('resource.read')
  async timeline(@Param('id') id: string, @Query() rawQuery: Record<string, unknown>, @Req() req: any) {
    const query = await this.validate(rawQuery, ResourceV2ReviewTimelineQueryDto);
    return this.review.getReviewTimeline(id, Number(req.user.id), query);
  }

  @Post(':id/versions/:versionId/analysis/overrides')
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'ignoreResourceAnalysisFindingV2', summary: '忽略已发布版本的一条分析结果', description: '只允许该 Resource 的 Owner/Maintainer 操作；ERROR/WARNING 仍记录在原始分析中，忽略记录带 reason、actor、timestamp 和 parser_version。' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiParam({ name: 'versionId', format: 'uuid', description: 'Published version public UUID。' })
  @ApiBody({ type: ResourceV2FindingOverrideDto })
  @ApiExtraModels(ResourceV2FindingOverrideResponseDto, ResourceV2ApiMetaDto, ResourceV2ApiErrorEnvelopeDto)
  @ApiOkResponse({ description: 'Finding ignore was saved.', schema: reviewSuccessSchema(ResourceV2FindingOverrideResponseDto, { resource_public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', version_public_id: '16d81bd0-90c7-48ed-a371-a81059aaddc9', finding_key: 'missing-dependency-version', severity: 'WARNING', ignored: true, reason: 'Verified against release notes.', actor: 'maintainer', timestamp: '2026-10-05T08:00:00.000Z', parser_version: '1.0.0' }) })
  @ApiBadRequestResponse({ description: 'Finding is not an ERROR/WARNING or request is invalid.', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('BAD_REQUEST', '只能忽略 ERROR 或 WARNING finding。') })
  @ApiUnauthorizedResponse({ description: '需要有效的 MindAuth access token 或 MDTBBS 登录会话。', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('UNAUTHORIZED', '需要登录。') })
  @ApiForbiddenResponse({ description: 'Current user is not an active Owner or Maintainer.', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('FORBIDDEN', '只有 Resource Owner 或 Maintainer 可以忽略分析结果。') })
  @ApiNotFoundResponse({ description: 'Resource, published version, or finding does not exist.', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('RESOURCE_NOT_FOUND', '分析结果不存在。') })
  @OAuthProtected('resource.upload')
  async ignoreFinding(@Param('id') id: string, @Param('versionId') versionId: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    const body = await this.validate(raw, ResourceV2FindingOverrideDto);
    return this.review.setFindingIgnore(id, versionId, Number(req.user.id), body);
  }

  @Delete(':id/versions/:versionId/analysis/overrides')
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'clearResourceAnalysisFindingV2', summary: '清除已发布版本的一条分析忽略记录', description: '只允许该 Resource 的 Owner/Maintainer 操作；清除行为也写入审核时间线和审计日志。' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiParam({ name: 'versionId', format: 'uuid', description: 'Published version public UUID。' })
  @ApiBody({ type: ResourceV2ClearFindingOverrideDto })
  @ApiExtraModels(ResourceV2FindingOverrideResponseDto, ResourceV2ApiMetaDto, ResourceV2ApiErrorEnvelopeDto)
  @ApiOkResponse({ description: 'Finding ignore was cleared.', schema: reviewSuccessSchema(ResourceV2FindingOverrideResponseDto, { resource_public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', version_public_id: '16d81bd0-90c7-48ed-a371-a81059aaddc9', finding_key: 'missing-dependency-version', severity: 'WARNING', ignored: false, changed: true, reason: 'Release notes now document this dependency.', parser_version: '1.0.0' }) })
  @ApiBadRequestResponse({ description: 'Finding or request is invalid.', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('BAD_REQUEST', 'finding_key 无效。') })
  @ApiUnauthorizedResponse({ description: '需要有效的 MindAuth access token 或 MDTBBS 登录会话。', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('UNAUTHORIZED', '需要登录。') })
  @ApiForbiddenResponse({ description: 'Current user is not an active Owner or Maintainer.', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('FORBIDDEN', '只有 Resource Owner 或 Maintainer 可以清除分析忽略。') })
  @ApiNotFoundResponse({ description: 'Resource, published version, or finding does not exist.', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('RESOURCE_NOT_FOUND', '分析结果不存在。') })
  @OAuthProtected('resource.upload')
  async clearFinding(@Param('id') id: string, @Param('versionId') versionId: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    const body = await this.validate(raw, ResourceV2ClearFindingOverrideDto);
    return this.review.clearFindingIgnore(id, versionId, Number(req.user.id), body);
  }

  @Post(':id/review-annotations')
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ operationId: 'createResourceReviewAnnotationV2', summary: '由管理员或版主添加 Resource 字段批注', description: '可关联一个 Resource version public UUID；批注与审核事件、操作者和 parser_version 一并保存。' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiBody({ type: ResourceV2ReviewAnnotationDto })
  @ApiExtraModels(ResourceV2ReviewAnnotationResponseDto, ResourceV2ApiMetaDto, ResourceV2ApiErrorEnvelopeDto)
  @ApiCreatedResponse({ description: 'Field annotation and review timeline event were saved.', schema: reviewSuccessSchema(ResourceV2ReviewAnnotationResponseDto, { resource_public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', version_public_id: null, field_path: 'manifest.source_url', severity: 'WARNING', body: 'Review the source URL before approval.', actor: 'moderator', timestamp: '2026-10-05T08:00:00.000Z', parser_version: null }) })
  @ApiBadRequestResponse({ description: 'Field path, severity, version UUID, or body is invalid.', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('BAD_REQUEST', '批注内容无效。') })
  @ApiUnauthorizedResponse({ description: '需要有效的 MindAuth access token 或 MDTBBS 登录会话。', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('UNAUTHORIZED', '需要登录。') })
  @ApiForbiddenResponse({ description: 'Only an administrator or moderator can add review annotations.', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('FORBIDDEN', '只有管理员或版主可以添加审核批注。') })
  @ApiNotFoundResponse({ description: 'Resource or associated version does not exist.', type: ResourceV2ApiErrorEnvelopeDto, example: reviewErrorExample('RESOURCE_NOT_FOUND', '资源或版本不存在。') })
  @OAuthProtected('resource.upload')
  async annotate(@Param('id') id: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    const body = await this.validate(raw, ResourceV2ReviewAnnotationDto);
    return this.review.addFieldAnnotation(id, Number(req.user.id), body);
  }

  private validate<T>(raw: Record<string, unknown>, metatype: new (...args: any[]) => T): Promise<T> {
    return new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
      .transform(raw || {}, { type: 'body', metatype }) as Promise<T>;
  }
}
