import { BadRequestException, Body, Controller, Get, Param, Post, Put, Req, ValidationPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBody, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse,
  ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OAuthOptionalProtected, OAuthProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import {
  ResourceV2AuthorResponseDto, ResourceV2MapFeedbackDto, ResourceV2ModCompatibilityReportDto,
  ResourceV2ModConflictAuthorResponseDto, ResourceV2ModConflictReportDto, ResourceV2ModIssueReportDto,
} from './resources-v2-community-write.dto';
import { ResourceV2CommunityWriteService } from './resource-v2-community-write.service';

@ApiV1()
@ApiTags('v1-resources-v2-community')
@Controller('v1/resources')
export class ResourcesV2CommunityWriteController {
  constructor(private readonly community: ResourceV2CommunityWriteService) {}

  @Get('maps/:id/versions/:versionId/feedback')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ operationId: 'getMapFeedbackAggregateV2', summary: '读取地图版本的结构化社区反馈聚合' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiOkResponse({ description: 'Feedback count and per-rating averages for a published map version.' })
  @ApiUnauthorizedResponse({ description: '携带的登录凭据无效。' })
  @ApiNotFoundResponse({ description: '地图或已发布版本不存在或不可见。' })
  mapFeedbackAggregate(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.community.getMapFeedbackAggregate(id, versionId);
  }

  @Post('maps/:id/versions/:versionId/feedback')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'upsertMapFeedbackV2', summary: '提交或更新地图版本反馈', description: '要求登录且当前账号已完成手机号验证；每个账号对每个地图版本保留一份反馈。' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiBody({ type: ResourceV2MapFeedbackDto })
  @ApiOkResponse({ description: 'Feedback saved; the response contains the updated aggregate.' })
  @ApiBadRequestResponse({ description: 'Invalid feedback or rating.' })
  @ApiForbiddenResponse({ description: 'Login and phone verification are required.' })
  @ApiNotFoundResponse({ description: 'Map or published version does not exist or is not visible.' })
  async upsertMapFeedback(@Param('id') id: string, @Param('versionId') versionId: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    const body = await this.validate(raw, ResourceV2MapFeedbackDto);
    return this.community.upsertMapFeedback(id, versionId, Number(req.user.id), body);
  }

  @Post('mods/:id/versions/:versionId/compatibility-reports')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'submitModCompatibilityReportV2', summary: '提交或更新当前账号对 Mod Release 的兼容性报告', description: '要求登录并完成手机号验证。报告每账号、每 Release 唯一，可重复提交更新。附件字段仅接受元数据；用户须先移除 IP、令牌、用户名、本机路径和其他隐私信息。' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiBody({ type: ResourceV2ModCompatibilityReportDto })
  @ApiCreatedResponse({ description: 'Compatibility report was saved.' })
  @ApiBadRequestResponse({ description: 'Invalid report or attachment metadata.' })
  @ApiForbiddenResponse({ description: 'Login and phone verification are required.' })
  @ApiNotFoundResponse({ description: 'Mod or published version does not exist or is not visible.' })
  async submitCompatibilityReport(@Param('id') id: string, @Param('versionId') versionId: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    const body = await this.validate(raw, ResourceV2ModCompatibilityReportDto);
    return this.community.submitModCompatibilityReport(id, versionId, Number(req.user.id), body);
  }

  @Put('mods/compatibility-reports/:reportId')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'updateModCompatibilityReportV2', summary: '更新本人提交的 Mod 兼容性报告' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiBody({ type: ResourceV2ModCompatibilityReportDto })
  @ApiOkResponse({ description: 'Compatibility report updated.' })
  @ApiBadRequestResponse({ description: 'Invalid report or attachment metadata.' })
  @ApiForbiddenResponse({ description: 'Login and phone verification are required.' })
  @ApiNotFoundResponse({ description: 'The report does not exist or is not owned by the current user.' })
  async updateCompatibilityReport(@Param('reportId') reportId: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    return this.community.updateModCompatibilityReport(reportId, Number(req.user.id), await this.validate(raw, ResourceV2ModCompatibilityReportDto));
  }

  @Post('mods/:id/versions/:versionId/issue-reports')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'submitModIssueReportV2', summary: '提交 Mod 版本问题报告', description: '要求登录并完成手机号验证。每账号每个 Mod Release 由唯一键保证幂等 upsert；重复提交更新原报告内容并保留 public UUID 和状态。附件字段仅接受元数据；请先移除隐私信息。' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiBody({ type: ResourceV2ModIssueReportDto })
  @ApiCreatedResponse({ description: 'Issue report was created or idempotently updated for the current user and published Release.' })
  @ApiBadRequestResponse({ description: 'Invalid report or attachment metadata.' })
  @ApiForbiddenResponse({ description: 'Login and phone verification are required.' })
  @ApiNotFoundResponse({ description: 'Mod or published version does not exist or is not visible.' })
  async submitIssueReport(@Param('id') id: string, @Param('versionId') versionId: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    return this.community.submitModIssueReport(id, versionId, Number(req.user.id), await this.validate(raw, ResourceV2ModIssueReportDto));
  }

  @Put('mods/issue-reports/:reportId')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'updateModIssueReportV2', summary: '更新本人提交的 Mod 问题报告' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiBody({ type: ResourceV2ModIssueReportDto })
  @ApiOkResponse({ description: 'Issue report updated.' })
  @ApiBadRequestResponse({ description: 'Invalid report or attachment metadata.' })
  @ApiForbiddenResponse({ description: 'Login and phone verification are required.' })
  @ApiNotFoundResponse({ description: 'The report does not exist or is not owned by the current user.' })
  async updateIssueReport(@Param('reportId') reportId: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    return this.community.updateModIssueReport(reportId, Number(req.user.id), await this.validate(raw, ResourceV2ModIssueReportDto));
  }

  @Post('mods/compatibility-reports/:reportId/author-response')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'respondToModCompatibilityReportV2', summary: '由 Mod Owner 或 Maintainer 回复兼容性报告' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiBody({ type: ResourceV2AuthorResponseDto })
  @ApiOkResponse({ description: 'Author response saved; fixed requires a published version UUID.' })
  @ApiBadRequestResponse({ description: 'Invalid response or fixed version.' })
  @ApiForbiddenResponse({ description: 'Current user is not an active Owner or Maintainer.' })
  @ApiNotFoundResponse({ description: 'Report or published version does not exist.' })
  async respondToCompatibilityReport(@Param('reportId') reportId: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    return this.community.respondToModCompatibilityReport(reportId, Number(req.user.id), await this.validate(raw, ResourceV2AuthorResponseDto));
  }

  @Post('mods/issue-reports/:reportId/author-response')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'respondToModIssueReportV2', summary: '由 Mod Owner 或 Maintainer 回复问题报告' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiBody({ type: ResourceV2AuthorResponseDto })
  @ApiOkResponse({ description: 'Author response saved; fixed requires a published version UUID.' })
  @ApiBadRequestResponse({ description: 'Invalid response or fixed version.' })
  @ApiForbiddenResponse({ description: 'Current user is not an active Owner or Maintainer.' })
  @ApiNotFoundResponse({ description: 'Report or published version does not exist.' })
  async respondToIssueReport(@Param('reportId') reportId: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    return this.community.respondToModIssueReport(reportId, Number(req.user.id), await this.validate(raw, ResourceV2AuthorResponseDto));
  }

  @Post('mods/conflicts')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'submitModConflictReportV2', summary: '提交包含多个已发布 Mod 版本的冲突报告', description: '要求登录并完成手机号验证。最初状态为 unverified，成员数限制为 2–10。' })
  @ApiBody({ type: ResourceV2ModConflictReportDto })
  @ApiCreatedResponse({ description: 'Conflict report and public UUID members were saved with unverified status.' })
  @ApiBadRequestResponse({ description: 'Invalid members, versions, or conflict details.' })
  @ApiForbiddenResponse({ description: 'Login and phone verification are required.' })
  @ApiNotFoundResponse({ description: 'A Mod or published version does not exist or is not visible.' })
  async submitConflictReport(@Body() raw: Record<string, unknown>, @Req() req: any) {
    return this.community.submitModConflictReport(Number(req.user.id), await this.validate(raw, ResourceV2ModConflictReportDto));
  }

  @Post('mods/conflicts/:reportId/author-response')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'respondToModConflictReportV2', summary: '由冲突涉及的 Mod Owner 或 Maintainer 回复冲突报告' })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @ApiBody({ type: ResourceV2ModConflictAuthorResponseDto })
  @ApiOkResponse({ description: 'Author response saved; fixed must reference a published release of a conflict member.' })
  @ApiBadRequestResponse({ description: 'Invalid response or fixed release.' })
  @ApiForbiddenResponse({ description: 'Current user is not an active Owner or Maintainer of an involved Mod.' })
  @ApiNotFoundResponse({ description: 'Conflict report or fixed release does not exist.' })
  async respondToConflictReport(@Param('reportId') reportId: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    return this.community.respondToModConflictReport(reportId, Number(req.user.id), await this.validate(raw, ResourceV2ModConflictAuthorResponseDto));
  }

  private validate<T>(raw: Record<string, unknown>, metatype: new (...args: any[]) => T): Promise<T> {
    return new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
      .transform(raw || {}, { type: 'body', metatype }) as Promise<T>;
  }
}
