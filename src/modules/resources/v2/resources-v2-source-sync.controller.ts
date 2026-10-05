import { Body, Controller, Get, Param, Post, Put, Query, Req, ValidationPipe } from '@nestjs/common';
import {
  ApiBadGatewayResponse, ApiBadRequestResponse, ApiBody, ApiCreatedResponse,
  ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation,
  ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OAuthOptionalProtected, OAuthProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import {
  ResourceSourceSyncConfigDto, ResourceSourceSyncImportDto, ResourceSourceSyncReleaseQueryDto,
} from './resource-source-sync.dto';
import { ResourceSourceSyncService } from './resource-source-sync.service';

@ApiV1()
@ApiTags('v1-resources-source-sync')
@Controller('v1/resources')
export class ResourcesV2SourceSyncController {
  constructor(private readonly sourceSync: ResourceSourceSyncService) {}

  @Put(':id/source-sync/github')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({
    operationId: 'upsertResourceGithubSourceSyncV2',
    summary: '配置 Mod 的 GitHub Release 来源',
    description: '仅 Owner/Maintainer 可操作。允许 HTTPS github.com 仓库 URL 与资产名过滤。enabled=true 表示选择加入每 15 分钟运行的自动轮询和导入；关闭时仍可由作者手动读取和导入。上游资产变更或无法安全验证时会暂停自动同步并通知 Owner，不覆盖已有版本。',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiBody({ type: ResourceSourceSyncConfigDto })
  @ApiOkResponse({ description: 'GitHub Release source configuration saved.' })
  @ApiBadRequestResponse({ description: 'Repository URL or filter configuration is invalid.' })
  @ApiForbiddenResponse({ description: 'Only an active Resource Owner or Maintainer can configure the source.' })
  @ApiNotFoundResponse({ description: 'Resource does not exist.' })
  async upsertConfig(@Param('id') id: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    const body = await this.validate(raw, ResourceSourceSyncConfigDto);
    return this.sourceSync.upsertGithubConfig(id, Number(req.user.id), body);
  }

  @Get(':id/source-sync/github/releases')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 12, window: 60 })
  @ApiOperation({
    operationId: 'listResourceGithubReleasesV2',
    summary: '手动读取 GitHub Release、README 與 License 预览',
    description: '作者手动读取公开 Mod 的 GitHub 信息；每次最多四个固定 GitHub API 请求、一页 Release。开启自动同步后，独立后台任务最多每 15 分钟检查一次，并安全导入符合过滤条件的新版本。',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 30 }, example: 20 })
  @ApiOkResponse({ description: 'Filtered public GitHub releases plus bounded README and License previews.' })
  @ApiBadRequestResponse({ description: 'Resource public UUID or page size is invalid.' })
  @ApiNotFoundResponse({ description: 'Resource is not public or has no enabled GitHub source.' })
  @ApiBadGatewayResponse({ description: 'GitHub is unavailable, rate-limited, or returned invalid data.' })
  @ApiUnauthorizedResponse({ description: 'Provided optional credentials are invalid.' })
  async listReleases(@Param('id') id: string, @Query() raw: Record<string, unknown>) {
    const query = await this.validate(raw, ResourceSourceSyncReleaseQueryDto);
    return this.sourceSync.listGithubReleases(id, query.limit);
  }

  @Post(':id/source-sync/github/import')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 5, window: 60 })
  @ApiOperation({
    operationId: 'importResourceGithubReleaseV2',
    summary: '显式导入一个 GitHub Release 资产',
    description: '仅 Owner/Maintainer 可手动操作；启用的后台同步也复用相同导入校验。资产通过本地格式校验、进入 quarantine，再由现有 ResourceVersionService 分析并创建不可覆盖的版本/revision。若已有 tag 对应的上游资产发生变化，后台会暂停并等待人工确认。',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiBody({ type: ResourceSourceSyncImportDto })
  @ApiCreatedResponse({ description: 'A new immutable version/revision was created from the selected release asset.' })
  @ApiBadRequestResponse({ description: 'Release channel, asset filter, size, URL, or archive validation failed.' })
  @ApiForbiddenResponse({ description: 'Only an active Resource Owner or Maintainer can import a release.' })
  @ApiNotFoundResponse({ description: 'Resource, source, release, or selected asset does not exist.' })
  @ApiBadGatewayResponse({ description: 'GitHub is unavailable or the selected asset could not be downloaded.' })
  async importRelease(@Param('id') id: string, @Body() raw: Record<string, unknown>, @Req() req: any) {
    const body = await this.validate(raw, ResourceSourceSyncImportDto);
    return this.sourceSync.importGithubRelease(id, Number(req.user.id), body);
  }

  private validate<T>(raw: Record<string, unknown>, metatype: new (...args: any[]) => T): Promise<T> {
    return new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
      .transform(raw || {}, { type: 'body', metatype }) as Promise<T>;
  }
}
