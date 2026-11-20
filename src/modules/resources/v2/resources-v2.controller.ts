import { applyDecorators, BadRequestException, Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiExtraModels, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces,
  ApiParam, ApiQuery, ApiResponse, ApiTags, ApiUnauthorizedResponse, getSchemaPath,
} from '@nestjs/swagger';
import { Type } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Response } from 'express';
import { ApiV1, RawHttpResponse } from '@common/decorators/api-v1.decorator';
import { OAuthOptionalProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import {
  ResourceV2AnalysisResponseDto,
  ResourceV2ApiErrorDto,
  ResourceV2ApiErrorEnvelopeDto,
  ResourceV2ApiMetaDto,
  ResourceV2BlockPageDto,
  ResourceV2CompatibilityResponseDto,
  ResourceV2ConflictPageDto,
  ResourceV2ContentDto,
  ResourceV2ContentPageDto,
  ResourceV2ContentSearchQueryDto,
  ResourceV2DependencyResolutionDto,
  ResourceV2DependencyResolveQueryDto,
  ResourceV2DiffDto,
  ResourceV2DiffQueryDto,
  ResourceV2EmbedCardsDto,
  ResourceV2EmbedCardsQueryDto,
  ResourceV2LogicSearchPageDto,
  ResourceV2LogicSearchQueryDto,
  ResourceV2MapDiffChunkDto,
  ResourceV2MapDiffChunkQueryDto,
  ResourceV2IssueReportPageDto,
  ResourceV2LocalizationPageDto,
  ResourceV2ManifestDto,
  ResourceV2MapDetailDto,
  ResourceV2MapResourcePageDto,
  ResourceV2MapRulesDto,
  ResourceV2MaterialPageDto,
  ResourceV2ModDetailDto,
  ResourceV2PageDto,
  ResourceV2PageQueryDto,
  ResourceV2ProductionResponseDto,
  ResourceV2RelationPageDto,
  ResourceV2ResolveModDto,
  ResourceV2SchematicDetailDto,
  ResourceV2SpawnPageDto,
  ResourceV2StatsDto,
  ResourceV2VersionPageDto,
  ResourceV2VersionQueryDto,
  ResourceV2WavePageDto,
  ResourceWorkbenchV2Dto,
} from './resources-v2.dto';
import { ResourcesV2Service } from './resources-v2.service';
import { ResourceEmbedService } from '../resource-embed.service';
import { SchematicLogicIndexService } from '../schematic-logic-index.service';
import { ResourceVisualDiffService } from './resource-visual-diff.service';

function v2ReadResponse(dto: Type<unknown>, operationId: string, description: string, rateLimit = 60) {
  const successSchema = {
    allOf: [{
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: { $ref: getSchemaPath(dto) },
        meta: { $ref: getSchemaPath(ResourceV2ApiMetaDto) },
      },
    }],
  };
  const errorExample = {
    error: { code: 'RESOURCE_NOT_FOUND', message: '资源不存在或不可见', retryable: false, details: [], documentation_url: 'https://mdtbbs.cn/api/v1/docs/errors#resource-not-found' },
    meta: { request_id: 'req_01J9XZ4B9Y4Y8V1JXK5Z7Q0W12' },
  };
  return applyDecorators(
    ApiOperation({ operationId, summary: description, description: `${description} 匿名可读；携带 MindAuth Bearer 时需有 resource.read scope。公开对象以 public UUID 标识。` }),
    OAuthOptionalProtected('resource.read'),
    RateLimit({ max: rateLimit, window: 60 }),
    ApiExtraModels(dto, ResourceV2ApiMetaDto, ResourceV2ApiErrorDto, ResourceV2ApiErrorEnvelopeDto),
    ApiOkResponse({
      description: `${description}。响应使用 MDTBBS V1 { data, meta } 包装。`,
      schema: {
        ...successSchema,
        example: { data: {}, meta: { request_id: 'req_01J9XZ4B9Y4Y8V1JXK5Z7Q0W12' } },
      },
    }),
    ApiBadRequestResponse({ description: '请求参数无效或分页游标无效。', type: ResourceV2ApiErrorEnvelopeDto, example: errorExample }),
    ApiUnauthorizedResponse({ description: '携带的登录凭据无效。', type: ResourceV2ApiErrorEnvelopeDto, example: { ...errorExample, error: { ...errorExample.error, code: 'UNAUTHORIZED', message: '需要有效的访问令牌或登录会话。' } } }),
    ApiNotFoundResponse({ description: '资源不存在、不可见或类型不匹配。', type: ResourceV2ApiErrorEnvelopeDto, example: errorExample }),
  );
}

function publicUuidParam(name = 'id') {
  return ApiParam({ name, format: 'uuid', example: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', description: 'Resource public UUID。' });
}

function pageQueries(version = false) {
  return applyDecorators(
    ApiQuery({ name: 'cursor', required: false, type: String, schema: { maxLength: 1024 }, description: 'Opaque cursor returned in the previous page pagination.next_cursor.' }),
    ApiQuery({ name: 'limit', required: false, type: Number, schema: { minimum: 1, maximum: 100 }, example: 20 }),
    ...(version ? [ApiQuery({ name: 'version_public_id', required: false, type: String, schema: { format: 'uuid' }, description: 'Select a published version; omitted selects the recommended/latest published version.' })] : []),
  );
}

@ApiV1()
@ApiTags('v1-resources-v2')
@Controller('v1/resources')
export class ResourcesV2Controller {
  constructor(
    private readonly resources: ResourcesV2Service,
    private readonly resourceEmbeds: ResourceEmbedService,
    private readonly visualDiff: ResourceVisualDiffService,
    private readonly logicIndex: SchematicLogicIndexService,
  ) {}

  /**
   * 富文本资源卡片的批量水合。路径使用两段，避免与 V1 的 `GET /resources/:id`
   * 单段路由按注册顺序冲突。匿名可读；携带 Bearer 时作者/管理员可看到自己的
   * 审核中资源，响应仍只含公开 UUID。
   */
  @Get('embeds/cards')
  @ApiQuery({ name: 'ids', required: true, type: String, description: '逗号分隔的 Resource public UUID，最多 10 个。' })
  @v2ReadResponse(ResourceV2EmbedCardsDto, 'listResourceEmbedCardsV2', '批量读取富文本资源卡片', 60)
  async embedCards(@Query() query: ResourceV2EmbedCardsQueryDto, @Req() req: any) {
    const ids = String(query.ids || '').split(',').map((id) => id.trim()).filter(Boolean);
    if (!ids.length || ids.length > 10 || ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      throw new BadRequestException('ids 必须是 1 到 10 个 Resource public UUID');
    }
    return { items: await this.resourceEmbeds.getCards(ids, req?.user ? { id: req.user.id, role: req.user.role } : null) };
  }

  @Get(':id/versions')
  @publicUuidParam()
  @pageQueries()
  @v2ReadResponse(ResourceV2VersionPageDto, 'listResourceVersionsV2', '列出 Resource 的已发布 V2 版本', 60)
  versions(@Param('id') id: string, @Query() query: ResourceV2PageQueryDto) { return this.resources.getVersions(id, query); }

  @Get(':id/relations')
  @publicUuidParam()
  @pageQueries()
  @v2ReadResponse(ResourceV2RelationPageDto, 'listResourceRelationsV2', '列出 Resource 的公开关联资源', 60)
  relations(@Param('id') id: string, @Query() query: ResourceV2PageQueryDto) { return this.resources.getRelations(id, query); }

  @Get(':id/stats')
  @publicUuidParam()
  @v2ReadResponse(ResourceV2StatsDto, 'getResourceStatsV2', '读取 Resource 聚合统计', 60)
  stats(@Param('id') id: string) { return this.resources.getStats(id); }

  @Get(':id/versions/:versionId/preview')
  @RawHttpResponse()
  @publicUuidParam('id')
  @ApiParam({ name: 'versionId', format: 'uuid', example: '84b37577-d086-4897-a866-658e29e0bd09' })
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ operationId: 'getResourceVersionPreviewV2', summary: '读取指定版本预览 PNG' })
  @ApiProduces('image/png')
  @ApiOkResponse({ description: 'PNG preview bytes for the selected version, falling back to the current resource preview when no version preview exists.', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: '携带的登录凭据无效。' })
  @ApiNotFoundResponse({ description: '资源、已发布版本或预览不存在。' })
  @ApiResponse({ status: 302, description: 'Redirects new RES previews to their public URL; historical PNG bytes remain supported.' })
  async versionPreview(@Param('id') id: string, @Param('versionId') versionId: string, @Res() response: Response) {
    const redirect = await this.resources.getVersionPreviewUrl(id, versionId);
    if (redirect) return response.redirect(302, redirect);
    const image = await this.resources.readVersionPreview(id, versionId);
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.setHeader('ETag', `"${createHash('sha256').update(image).digest('hex')}"`);
    return response.send(image);
  }

  @Get(':id/workbench')
  @publicUuidParam()
  @v2ReadResponse(ResourceWorkbenchV2Dto, 'getResourceWorkbenchV2', '读取公开或有权限访问的 Resource V2 工作台', 60)
  workbench(@Param('id') id: string, @Req() request: any, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getWorkbench(id, request.user || null, query.version_public_id); }

  @Get('mods/:id')
  @publicUuidParam()
  @v2ReadResponse(ResourceV2ModDetailDto, 'getModResourceV2', '读取 Mod Resource 详情', 60)
  modDetail(@Param('id') id: string) { return this.resources.getTypeDetail(id, 'mod'); }

  @Get('mods/:id/versions')
  @publicUuidParam()
  @pageQueries()
  @v2ReadResponse(ResourceV2VersionPageDto, 'listModResourceVersionsV2', '列出 Mod Resource 的已发布版本', 60)
  modVersions(@Param('id') id: string, @Query() query: ResourceV2PageQueryDto) { return this.resources.getTypeVersions(id, 'mod', query); }

  @Get('mods/:id/manifest')
  @publicUuidParam()
  @v2ReadResponse(ResourceV2ManifestDto, 'getModResourceManifestV2', '读取聚合 Mod manifest', 60)
  modManifest(@Param('id') id: string) { return this.resources.getManifest(id, 'mod'); }

  @Get('mods/:id/resolve')
  @ApiParam({ name: 'id', example: 'org.example.mod', description: 'Canonical Mod ID、历史 alias 或 Resource public UUID。' })
  @v2ReadResponse(ResourceV2ResolveModDto, 'resolveModIdV2', '将 Mod ID 或历史 alias 解析到公开 Resource', 60)
  resolveMod(@Param('id') id: string) { return this.resources.resolveMod(id); }

  @Get('mods/:id/contents')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2ContentPageDto, 'listModContentsV2', '读取指定 Mod 版本的 Content 索引', 60)
  modContents(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getModContents(id, query); }

  @Get('mods/:id/localizations')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2LocalizationPageDto, 'listModLocalizationsV2', '读取指定 Mod 版本的本地化覆盖率', 60)
  modLocalizations(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getLocalizations(id, query); }

  @Get('mods/:id/dependencies')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2PageDto, 'listModDependenciesV2', '读取指定 Mod 版本的直接依赖', 60)
  modDependencies(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getDependencies(id, 'mod', query); }

  @Get('mods/:id/dependency-resolution')
  @publicUuidParam()
  @ApiQuery({ name: 'version_public_id', required: false, type: String, schema: { format: 'uuid' }, description: 'Select a published version; omitted selects the recommended/latest published version.' })
  @ApiQuery({ name: 'max_depth', required: false, type: Number, schema: { minimum: 1, maximum: 12 }, example: 12 })
  @ApiQuery({ name: 'max_nodes', required: false, type: Number, schema: { minimum: 1, maximum: 200 }, example: 200 })
  @v2ReadResponse(ResourceV2DependencyResolutionDto, 'resolveModDependencyTreeV2', '解析 Mod 版本的直接与传递依赖；包含未收录项、循环与截断状态', 30)
  resolveModDependencyTree(@Param('id') id: string, @Query() query: ResourceV2DependencyResolveQueryDto) { return this.resources.resolveDependencies(id, query); }

  @Get('mods/:id/compatibility')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2CompatibilityResponseDto, 'getModCompatibilityV2', '读取 Mod 版本兼容性与公开社区报告', 60)
  modCompatibility(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getCompatibility(id, 'mod', query); }

  @Get('mods/:id/conflicts')
  @publicUuidParam()
  @pageQueries()
  @v2ReadResponse(ResourceV2ConflictPageDto, 'listModConflictsV2', '读取公开涉及该 Mod 的冲突报告', 60)
  modConflicts(@Param('id') id: string, @Query() query: ResourceV2PageQueryDto) { return this.resources.getConflicts(id, query); }

  @Get('mods/:id/issue-reports')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2IssueReportPageDto, 'listModIssueReportsV2', '分页读取 Mod 已发布版本的问题报告与作者回复', 60)
  modIssueReports(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getIssueReports(id, query); }

  @Get('mods/:id/relations')
  @publicUuidParam()
  @pageQueries()
  @v2ReadResponse(ResourceV2RelationPageDto, 'listModRelationsV2', '列出 Mod Resource 的公开关联资源', 60)
  modRelations(@Param('id') id: string, @Query() query: ResourceV2PageQueryDto) { return this.resources.getRelations(id, query, 'mod'); }

  @Get('mods/:id/analysis')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2AnalysisResponseDto, 'getModAnalysisV2', '读取 Mod 静态分析结果与作者忽略记录', 60)
  modAnalysis(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getAnalysis(id, 'mod', query); }

  @Get('mods/:id/diff')
  @publicUuidParam()
  @v2ReadResponse(ResourceV2DiffDto, 'getModVersionDiffV2', '读取 Mod 版本差异；缺少结构化 diff 时返回 null', 60)
  modDiff(@Param('id') id: string, @Query() query: ResourceV2DiffQueryDto) { return this.resources.getDiff(id, 'mod', query); }

  @Get('schematics/logic-search')
  @v2ReadResponse(ResourceV2LogicSearchPageDto, 'searchSchematicLogicV2', '检索公开已发布蓝图的 mlog 逻辑片段（纯静态，不执行脚本）', 60)
  logicSearch(@Query() query: ResourceV2LogicSearchQueryDto) { return this.logicIndex.search(query); }

  @Get('schematics/:id')
  @publicUuidParam()
  @v2ReadResponse(ResourceV2SchematicDetailDto, 'getSchematicResourceV2', '读取蓝图 Resource 与选定版本元数据', 60)
  schematicDetail(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getTypeDetail(id, 'schematic', query); }

  @Get('schematics/:id/versions')
  @publicUuidParam()
  @pageQueries()
  @v2ReadResponse(ResourceV2VersionPageDto, 'listSchematicVersionsV2', '列出蓝图 Resource 的已发布版本', 60)
  schematicVersions(@Param('id') id: string, @Query() query: ResourceV2PageQueryDto) { return this.resources.getTypeVersions(id, 'schematic', query); }

  @Get('schematics/:id/manifest')
  @publicUuidParam()
  @v2ReadResponse(ResourceV2ManifestDto, 'getSchematicManifestV2', '读取聚合蓝图 manifest', 60)
  schematicManifest(@Param('id') id: string) { return this.resources.getManifest(id, 'schematic'); }

  @Get('schematics/:id/analysis')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2AnalysisResponseDto, 'getSchematicAnalysisV2', '读取蓝图分析结果与估算标记', 60)
  schematicAnalysis(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getAnalysis(id, 'schematic', query); }

  @Get('schematics/:id/blocks')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2BlockPageDto, 'listSchematicBlocksV2', '读取蓝图方块统计与可用坐标', 60)
  schematicBlocks(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getSchematicBlocks(id, query); }

  @Get('schematics/:id/materials')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2MaterialPageDto, 'listSchematicMaterialsV2', '读取蓝图建造材料清单', 60)
  schematicMaterials(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getSchematicMaterials(id, query); }

  @Get('schematics/:id/production')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2ProductionResponseDto, 'getSchematicProductionV2', '读取理论产能估算与可用性', 60)
  schematicProduction(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getSchematicProduction(id, query); }

  @Get('schematics/:id/logic')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2PageDto, 'listSchematicLogicV2', '读取蓝图 Logic Processor 的静态链接与变量元数据', 60)
  schematicLogic(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getSchematicLogic(id, query); }

  @Get('schematics/:id/dependencies')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2PageDto, 'listSchematicDependenciesV2', '读取蓝图版本依赖', 60)
  schematicDependencies(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getDependencies(id, 'schematic', query); }

  @Get('schematics/:id/relations')
  @publicUuidParam()
  @pageQueries()
  @v2ReadResponse(ResourceV2RelationPageDto, 'listSchematicRelationsV2', '列出蓝图 Resource 的公开关联资源', 60)
  schematicRelations(@Param('id') id: string, @Query() query: ResourceV2PageQueryDto) { return this.resources.getRelations(id, query, 'schematic'); }

  @Get('schematics/:id/diff')
  @publicUuidParam()
  @v2ReadResponse(ResourceV2DiffDto, 'getSchematicVersionDiffV2', '读取蓝图版本可视化差异；计算中返回 202', 60)
  async schematicDiff(
    @Param('id') id: string,
    @Query() query: ResourceV2DiffQueryDto,
    @Req() req: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.visualDiff.getDiff(id, 'schematic', query, req?.user);
    response.status(result.statusCode);
    return result.data;
  }

  @Get('maps/:id')
  @publicUuidParam()
  @v2ReadResponse(ResourceV2MapDetailDto, 'getMapResourceV2', '读取地图 Resource 与选定版本元数据', 60)
  mapDetail(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getTypeDetail(id, 'map', query); }

  @Get('maps/:id/versions')
  @publicUuidParam()
  @pageQueries()
  @v2ReadResponse(ResourceV2VersionPageDto, 'listMapVersionsV2', '列出地图 Resource 的已发布版本', 60)
  mapVersions(@Param('id') id: string, @Query() query: ResourceV2PageQueryDto) { return this.resources.getTypeVersions(id, 'map', query); }

  @Get('maps/:id/manifest')
  @publicUuidParam()
  @v2ReadResponse(ResourceV2ManifestDto, 'getMapManifestV2', '读取聚合地图 manifest', 60)
  mapManifest(@Param('id') id: string) { return this.resources.getManifest(id, 'map'); }

  @Get('maps/:id/analysis')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2AnalysisResponseDto, 'getMapAnalysisV2', '读取地图分析与 estimated 难度标记', 60)
  mapAnalysis(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getAnalysis(id, 'map', query); }

  @Get('maps/:id/rules')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2MapRulesDto, 'getMapRulesV2', '读取地图世界规则', 60)
  mapRules(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getMapRules(id, query); }

  @Get('maps/:id/resources')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2MapResourcePageDto, 'listMapResourcesV2', '读取地图资源分布摘要', 60)
  mapResources(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getMapResources(id, query); }

  @Get('maps/:id/waves')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2WavePageDto, 'listMapWavesV2', '读取地图波次摘要与尖峰标记', 60)
  mapWaves(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getMapWaves(id, query); }

  @Get('maps/:id/spawns')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2SpawnPageDto, 'listMapSpawnsV2', '读取地图出生点坐标', 60)
  mapSpawns(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getMapSpawns(id, query); }

  @Get('maps/:id/dependencies')
  @publicUuidParam()
  @pageQueries(true)
  @v2ReadResponse(ResourceV2PageDto, 'listMapDependenciesV2', '读取地图版本依赖', 60)
  mapDependencies(@Param('id') id: string, @Query() query: ResourceV2VersionQueryDto) { return this.resources.getDependencies(id, 'map', query); }

  @Get('maps/:id/relations')
  @publicUuidParam()
  @pageQueries()
  @v2ReadResponse(ResourceV2RelationPageDto, 'listMapRelationsV2', '列出地图 Resource 的公开关联资源', 60)
  mapRelations(@Param('id') id: string, @Query() query: ResourceV2PageQueryDto) { return this.resources.getRelations(id, query, 'map'); }

  @Get('maps/:id/diff')
  @publicUuidParam()
  @v2ReadResponse(ResourceV2DiffDto, 'getMapVersionDiffV2', '读取地图版本可视化差异；计算中返回 202', 60)
  async mapDiff(
    @Param('id') id: string,
    @Query() query: ResourceV2DiffQueryDto,
    @Req() req: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.visualDiff.getDiff(id, 'map', query, req?.user);
    response.status(result.statusCode);
    return result.data;
  }

  @Get('maps/:id/diff/chunk')
  @publicUuidParam()
  @ApiQuery({ name: 'cx', required: true, type: Number, description: '128×128 分区列号。' })
  @ApiQuery({ name: 'cy', required: true, type: Number, description: '128×128 分区行号。' })
  @v2ReadResponse(ResourceV2MapDiffChunkDto, 'getMapDiffChunkV2', '读取地图版本差异的 128×128 分区 RLE 明细；计算中返回 202', 60)
  async mapDiffChunk(
    @Param('id') id: string,
    @Query() query: ResourceV2MapDiffChunkQueryDto,
    @Req() req: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.visualDiff.getChunk(id, query, req?.user);
    response.status(result.statusCode);
    return result.data;
  }

  @Get('maps/:id/diff/overlay')
  @RawHttpResponse()
  @publicUuidParam()
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 30, window: 60 })
  @ApiOperation({ operationId: 'getMapDiffOverlayV2', summary: '读取地图版本差异的透明叠加层 PNG', description: '匿名可读；携带 MindAuth Bearer 时需有 resource.read scope。叠加层由 renderer 生成并与当前版本对绑定。' })
  @ApiProduces('image/png')
  @ApiResponse({ status: 200, description: 'PNG 差异叠加层。', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } })
  @ApiNotFoundResponse({ description: '资源、版本对或叠加层不存在。' })
  async mapDiffOverlay(
    @Param('id') id: string,
    @Query() query: ResourceV2DiffQueryDto,
    @Req() req: any,
    @Res() response: Response,
  ) {
    const buffer = await this.visualDiff.readOverlay(id, query, req?.user);
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.send(buffer);
  }
}

@ApiV1()
@ApiTags('v1-game-content-v2')
@Controller('v1/game-content/content')
export class GameContentIndexV2Controller {
  constructor(private readonly resources: ResourcesV2Service) {}

  @Get('search')
  @ApiQuery({ name: 'q', required: true, schema: { minLength: 1, maxLength: 255 }, example: 'conveyor' })
  @ApiQuery({ name: 'type', required: false, schema: { maxLength: 50 }, example: 'block' })
  @pageQueries()
  @v2ReadResponse(ResourceV2ContentPageDto, 'searchGameContentIndexV2', '搜索已发布 Mod Content 索引并返回所属 Resource', 60)
  search(@Query() query: ResourceV2ContentSearchQueryDto) { return this.resources.searchModContent(query); }

  @Get('by-name/:type/:internalName')
  @ApiParam({ name: 'type', example: 'block', description: 'Mindustry Content type。' })
  @ApiParam({ name: 'internalName', example: 'example-conveyor', description: '当前或历史 internal_name。' })
  @pageQueries()
  @v2ReadResponse(ResourceV2ContentPageDto, 'findGameContentByNameV2', '按 Content type 与当前或历史 internal_name 查询公开索引', 60)
  byName(@Param('type') type: string, @Param('internalName') internalName: string, @Query() query: ResourceV2PageQueryDto) {
    return this.resources.findContentByName(type, internalName, query);
  }

  @Get(':id')
  @publicUuidParam()
  @v2ReadResponse(ResourceV2ContentDto, 'getGameContentItemV2', '按 Content public UUID 读取单条 Content 索引', 60)
  byPublicId(@Param('id') id: string) { return this.resources.findContentByPublicId(id); }
}
