import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { OAuthOptionalProtected } from '@common/decorators/oauth-protected.decorator';
import { CapabilitiesService } from '../../capabilities/capabilities.service';
import {
  BadRequestException, Body, Controller, Get, Query, HttpStatus, Optional, Param, Patch, Post, Req, Res, ServiceUnavailableException, UploadedFile, UseInterceptors, ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiQuery, ApiBody, ApiConsumes, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader,
  ApiNotFoundResponse, ApiResponse, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ApiV1, RawHttpResponse } from '@common/decorators/api-v1.decorator';
import { OAuthProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { attachmentContentDisposition } from '@common/utils/content-disposition.util';
import { ResourceStorageService } from '../resource-storage.service';
import { ResourceDirectUploadService } from '../resource-direct-upload.service';
import { cleanupUploadedFile, MAX_RESOURCE_SIZE, resourceUploadInterceptor } from '../resources.controller';
import { ResourcesV2WriteService } from './resources-v2-write.service';
import { ResourceDirectUploadDraftResponseDto } from '../v1/resource-direct-upload.dto';
import { AuthService } from '../../auth/auth.service';
import { SettingsService } from '../../settings/settings.service';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';
import {
  ResourceV2CreateRelationDto, ResourceV2CreateVersionDto, ResourceV2InviteMemberDto,
  ResourceV2ExportMapDto, ResourceV2ExportSchematicDto, ResourceV2PatchProfileDto, ResourceV2RespondInvitationDto, ResourceV2TransferOwnerDto,
} from './resources-v2-write.dto';

@ApiV1()
@ApiTags('v1-resources-v2-management')
@Controller('v1/resources')
export class ResourcesV2WriteController {
  constructor(
    private readonly resources: ResourcesV2WriteService,
    private readonly storage: ResourceStorageService,
    @Optional() private readonly directUploads?: ResourceDirectUploadService,
    @Optional() private readonly settings?: SettingsService,
    @Optional() private readonly auth?: AuthService,
    @Optional() private readonly editorCapabilities?: CapabilitiesService,
  ) {}

  private async assertEditorAvailable(kind: 'map' | 'schematic') {
    if (!this.editorCapabilities) throw new ServiceUnavailableException('编辑器暂不可用');
    await this.editorCapabilities.assertEditorAvailable(kind);
  }

  @Post(':id/versions/analyze')
  @OAuthProtected('resource.upload')
  @UseInterceptors(resourceUploadInterceptor)
  @RateLimit({ max: 5, window: 60 })
  @ApiOperation({ operationId: 'analyzeResourceV2Version', summary: '安全解析待发布的 Resource 版本文件', description: '需要 resource.upload scope。只静态解析 Mod JAR/ZIP，绝不执行 Java/JavaScript/native code；地图和蓝图复用现有 renderer。' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: {
    file: { type: 'string', format: 'binary' },
    mod_author_overrides: { type: 'object', description: 'Mod 发布者字段覆盖；解析原值会单独保留。' },
  } } })
  @ApiOkResponse({ description: 'Parser summary, structured metadata, localization summary and findings.' })
  @ApiBadRequestResponse({ description: '文件损坏、格式无效、安全检查失败或解析器不可用。' })
  @ApiForbiddenResponse({ description: '当前用户没有该 Resource 的发布权限。' })
  @ApiNotFoundResponse({ description: 'Resource 不存在。' })
  async analyzeVersion(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    let stored: Awaited<ReturnType<ResourceStorageService['storeIncoming']>> | undefined;
    try {
      if (!file) throw new BadRequestException('请选择版本文件');
      await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      stored = await this.storage.storeIncoming(file);
      if (!stored) throw new BadRequestException('请选择版本文件');
      return await this.resources.analyzeVersion(id, stored, body || {}, Number(req.user.id));
    } finally {
      await cleanupUploadedFile(file);
      if (stored?.file_path) await this.storage.removeManaged(stored.file_path).catch(() => undefined);
    }
  }

  @Post(':id/versions/direct-drafts')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 5, window: 60 })
  @ApiOperation({ operationId: 'createResourceV2DirectVersionDraft', summary: '创建 metadata-first 直接上传版本草稿' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiConsumes('application/json')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'ASCII key scoped to the authenticated account and Resource.' })
  @ApiBody({ type: ResourceV2CreateVersionDto, description: 'Creates an upload_pending version without receiving file bytes.' })
  @ApiCreatedResponse({ type: ResourceDirectUploadDraftResponseDto, description: 'Upload draft identifiers and expiry; use the existing direct upload init/complete endpoints to attach the file.' })
  async createVersionDirectDraft(@Param('id') id: string, @Body() rawBody: Record<string, any>, @Req() req: any) {
    if (!this.directUploads) throw new ServiceUnavailableException('资源存储服务暂不可用，请稍后重试');
    await this.assertUploadEnabled(req.user);
    const body = await new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
      .transform(rawBody || {}, { type: 'body', metatype: ResourceV2CreateVersionDto }) as ResourceV2CreateVersionDto;
    const rawKey = req.headers?.['idempotency-key'];
    return this.directUploads.createVersionDraft(id, body, { id: Number(req.user.id), role: req.user.role }, typeof rawKey === 'string' ? rawKey : undefined);
  }

  private async assertUploadEnabled(user: any) {
    if (!this.settings || !this.auth) throw new ServiceUnavailableException('资源上传验证暂不可用');
    if (!await this.settings.getBoolean('feature_resources_v1_upload_enabled', true)) {
      throw new ApiV1Exception('RESOURCE_UPLOAD_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭资源上传', false);
    }
    if (await this.auth.checkNeedsTermsAcceptance(user)) {
      throw new ApiV1Exception('TERMS_ACCEPTANCE_REQUIRED', HttpStatus.FORBIDDEN, '请先接受社区条款', false);
    }
  }

  @Post(':id/versions')
  @OAuthProtected('resource.upload')
  @UseInterceptors(resourceUploadInterceptor)
  @RateLimit({ max: 5, window: 60 })
  @ApiOperation({ operationId: 'createResourceV2Version', summary: '发布新的 Resource 版本或创建不可覆盖的 revision', description: '同一版本号再次上传会创建新的 revision，并保留旧文件。' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['version', 'file'], properties: {
    version: { type: 'string', maxLength: 50, example: '1.2.0' },
    version_mode: { type: 'string', enum: ['semver', 'compatibility'] },
    release_channel: { type: 'string', enum: ['release', 'beta', 'alpha', 'snapshot'] },
    game_version_min: { type: 'string', maxLength: 80 }, game_version_max: { type: 'string', maxLength: 80 },
    content: { type: 'string', maxLength: 20_000 }, mod_id: { type: 'string', maxLength: 128 },
    mod_author_overrides: { type: 'object' }, file: { type: 'string', format: 'binary' },
  } } })
  @ApiCreatedResponse({ description: 'Version UUID, monotonically increasing revision number and analysis findings.' })
  @ApiBadRequestResponse({ description: 'Invalid version, file, parser output, or input metadata.' })
  @ApiForbiddenResponse({ description: 'Current user cannot publish for this Resource.' })
  @ApiNotFoundResponse({ description: 'Resource does not exist.' })
  async createVersion(
    @Param('id') id: string,
    @Body() rawBody: Record<string, any>,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    let stored: Awaited<ReturnType<ResourceStorageService['storeIncoming']>> | undefined;
    try {
      const body = await new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
        .transform(rawBody || {}, { type: 'body', metatype: ResourceV2CreateVersionDto }) as ResourceV2CreateVersionDto;
      if (!file) throw new BadRequestException('请选择版本文件');
      await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      stored = await this.storage.storeIncoming(file);
      if (!stored) throw new BadRequestException('请选择版本文件');
      if (!this.directUploads) throw new ServiceUnavailableException('资源存储服务暂不可用，请稍后重试');
      const resFile = await this.directUploads.uploadManagedFile(stored);
      const result = await this.resources.createVersion(id, resFile, body, Number(req.user.id));
      await this.storage.removeManaged(stored.file_path).catch(() => undefined);
      return result;
    } catch (error) {
      await cleanupUploadedFile(file);
      if (stored?.file_path) await this.storage.removeManaged(stored.file_path).catch(() => undefined);
      throw error;
    }
  }

  @SkipPhoneVerification()
  @Post(':id/versions/:versionId/schematic-editor/export')
  @RawHttpResponse()
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 5, window: 60 })
  @ApiOperation({ operationId: 'exportResourceSchematicEdit', summary: '安全导出编辑后的蓝图副本', description: '公开资源允许任何用户编辑和导出副本；私有资源仍需 Owner/Maintainer 权限。原资源发布权限保持不变。可对已发布蓝图执行旋转、水平镜像、删除、移动、放置方块，以及通过按 Mindustry v160.5 配置类型区分的安全配置编辑。只读取托管版本并返回新文件，不修改原版本；未知或不支持安全写回的配置/内容会拒绝导出。' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiParam({ name: 'versionId', format: 'uuid', description: '已发布 Version public UUID。' })
  @ApiConsumes('application/json')
  @ApiBody({ type: ResourceV2ExportSchematicDto })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'An official Mindustry .msch serialization as a downloadable file.', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ description: '操作无效、文件无法解析或含有编辑器不支持安全保留的内容。' })
  @ApiForbiddenResponse({ description: '私有资源不可见或当前用户无权限。' })
  @ApiNotFoundResponse({ description: '资源或已发布版本不存在。' })
  async exportSchematic(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() rawBody: Record<string, any>,
    @Req() req: any,
    @Res() response: Response,
  ) {
    const body = await new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
      .transform(rawBody || {}, { type: 'body', metatype: ResourceV2ExportSchematicDto }) as ResourceV2ExportSchematicDto;
    await this.assertEditorAvailable('schematic');
    const result = await this.resources.exportSchematic(id, versionId, body, Number(req.user?.id) || undefined);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', attachmentContentDisposition(result.file_name));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.send(result.data);
  }

  @SkipPhoneVerification()
  @Post(':id/versions/:versionId/map-editor/export')
  @RawHttpResponse()
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 5, window: 60 })
  @ApiOperation({ operationId: 'exportResourceMapEdit', summary: '安全导出编辑后的地图副本', description: '公开资源允许任何用户编辑和导出副本；私有资源仍需 Owner/Maintainer 权限。原资源发布权限保持不变。可编辑已发布地图的地形、类型化规则字段、波次组和核心/出生点/建筑对象（新增、删除、移动；核心/建筑可改队伍）。多格 footprint、边界、碰撞和对象内容由官方 MapIO 写入及重读验证；未知或不安全对象状态会拒绝导出。未知规则与波次字段保留。' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiParam({ name: 'versionId', format: 'uuid', description: '已发布 Version public UUID。' })
  @ApiConsumes('application/json')
  @ApiBody({ type: ResourceV2ExportMapDto })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'An official Mindustry .msav serialization as a derived file.', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ description: '操作无效、文件无法解析或含有编辑器不支持安全保留的内容。' })
  @ApiForbiddenResponse({ description: '私有资源不可见或当前用户无权限。' })
  @ApiNotFoundResponse({ description: '资源或已发布版本不存在。' })
  async exportMap(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() rawBody: Record<string, any>,
    @Req() req: any,
    @Res() response: Response,
  ) {
    const body = await new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
      .transform(rawBody || {}, { type: 'body', metatype: ResourceV2ExportMapDto }) as ResourceV2ExportMapDto;
    await this.assertEditorAvailable('map');
    const result = await this.resources.exportMap(id, versionId, body, Number(req.user?.id) || undefined);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', attachmentContentDisposition(result.file_name));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.send(result.data);
  }

  @Get(':id/versions/:versionId/editor-data')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 60, window: 60 })
  @ApiOperation({ operationId: 'readResourceEditorData', summary: '读取已发布版本的官方编辑数据', description: '历史版本缺少结构化索引时，校验源文件并按官方 reader/writer 重新解析；不修改原资源或回填数据库。公开资源允许编辑副本。' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiOkResponse({ description: '版本对应的官方元数据和有界方块列表。', schema: { type: 'object', properties: {
    metadata: { type: 'object', nullable: true, additionalProperties: true }, parser_version: { type: 'string', nullable: true },
    blocks: { type: 'array', maxItems: 10000, items: { type: 'object', properties: {
      internal_name: { type: 'string' }, display_name: { type: 'string' }, count: { type: 'integer' },
      positions: { type: 'array', items: { type: 'object', additionalProperties: true } },
    } } },
  } } })
  @ApiBadRequestResponse({ description: '文件无法安全解析或资源类型不支持。' })
  @ApiNotFoundResponse({ description: '资源不可见或已发布版本不存在。' })
  @ApiResponse({ status: 503, description: '官方解析器或资源存储未就绪。' })
  async editorData(@Param('id') id: string, @Param('versionId') versionId: string, @Req() request: any) {
    return this.resources.editorData(id, versionId, Number(request.user?.id) || undefined);
  }

  @Get(':id/versions/:versionId/map-editor/region')
  @OAuthOptionalProtected('resource.read')
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'readResourceMapEditRegion', summary: '读取已发布地图的有界编辑分区', description: '只读取 128×128 范围；公开资源可读，私有资源保留管理权限检查。源文件校验与官方 MapIO 加载不变。' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiQuery({ name: 'x', type: Number, required: true, description: '分区左上角 X 坐标，非负整数。' })
  @ApiQuery({ name: 'y', type: Number, required: true, description: '分区左上角 Y 坐标，非负整数。' })
  @ApiOkResponse({ description: '最多 128×128 的完整官方地图分区。', schema: { type: 'object', properties: {
    terrain: { type: 'array', maxItems: 16384, items: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' }, floor: { type: 'string' }, overlay: { type: 'string' } } } },
  } } })
  @ApiBadRequestResponse({ description: '坐标越界或文件无法安全解析。' })
  @ApiNotFoundResponse({ description: '资源不可见或已发布版本不存在。' })
  @ApiResponse({ status: 503, description: '官方解析器或资源存储未就绪。' })
  async mapRegion(@Param('id') id: string, @Param('versionId') versionId: string, @Query('x') x: string, @Query('y') y: string, @Req() request: any) {
    await this.assertEditorAvailable('map');
    return this.resources.mapRegion(id, versionId, Number(x), Number(y), Number(request.user?.id) || undefined);
  }

  @Patch(':id')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'updateResourceV2Profile', summary: '更新 Resource 基本资料', description: 'Owner/Maintainer 可修改资料。修改 source_url 或 license 会写审核事件并重新提交审核。' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiBody({ type: ResourceV2PatchProfileDto })
  @ApiOkResponse({ description: 'Updated public Resource fields.' })
  @ApiBadRequestResponse({ description: 'Invalid field value.' })
  @ApiForbiddenResponse({ description: 'Current user cannot edit this Resource.' })
  @ApiNotFoundResponse({ description: 'Resource does not exist.' })
  updateProfile(@Param('id') id: string, @Body() body: ResourceV2PatchProfileDto, @Req() req: any) {
    return this.resources.updateProfile(id, body, Number(req.user.id));
  }

  @Post(':id/relations')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'createResourceV2Relation', summary: '创建双向可查询的 Resource 关系' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ResourceV2CreateRelationDto })
  @ApiCreatedResponse({ description: 'Created relation using public resource UUIDs.' })
  @ApiBadRequestResponse({ description: 'Invalid relation target or type.' })
  @ApiForbiddenResponse({ description: 'Current user cannot edit relations.' })
  @ApiNotFoundResponse({ description: 'Source or target resource does not exist.' })
  createRelation(@Param('id') id: string, @Body() body: ResourceV2CreateRelationDto, @Req() req: any) {
    return this.resources.createRelation(id, body, Number(req.user.id));
  }

  @Post(':id/members')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'inviteResourceV2Member', summary: '按用户名邀请 Resource 协作者' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ResourceV2InviteMemberDto })
  @ApiCreatedResponse({ description: 'Invitation recorded with a pending acceptance state.' })
  @ApiForbiddenResponse({ description: 'Current user cannot invite this role.' })
  @ApiNotFoundResponse({ description: 'Resource or username does not exist.' })
  inviteMember(@Param('id') id: string, @Body() body: ResourceV2InviteMemberDto, @Req() req: any) {
    return this.resources.inviteMember(id, body.username, body.role, Number(req.user.id));
  }

  @Post(':id/members/respond')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 20, window: 60 })
  @ApiOperation({ operationId: 'respondToResourceV2Invitation', summary: '接受或拒绝协作者邀请；所有权转让必须接受后完成' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ResourceV2RespondInvitationDto })
  @ApiOkResponse({ description: 'Invitation response recorded.' })
  @ApiNotFoundResponse({ description: 'Invitation does not exist.' })
  async respondToInvitation(@Param('id') id: string, @Body() rawBody: Record<string, unknown>, @Req() req: any) {
    // The global ValidationPipe enables implicit conversion, where Boolean("false")
    // becomes true. Reject non-JSON booleans before transforming the DTO.
    if (!rawBody || typeof rawBody.accept !== 'boolean') {
      throw new BadRequestException('accept 必须是 JSON boolean');
    }
    const body = await new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
      .transform(rawBody, { type: 'body', metatype: ResourceV2RespondInvitationDto }) as ResourceV2RespondInvitationDto;
    return this.resources.respondToInvitation(id, body.accept, Number(req.user.id));
  }

  @Post(':id/owner-transfer')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiOperation({ operationId: 'beginResourceV2OwnershipTransfer', summary: '由 Owner/Admin 发起所有权转让；接收方必须确认' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ResourceV2TransferOwnerDto })
  @ApiCreatedResponse({ description: 'Ownership transfer invitation awaiting acceptance.' })
  @ApiForbiddenResponse({ description: 'Only the current Owner or an administrator can initiate transfer.' })
  @ApiNotFoundResponse({ description: 'Resource or receiving user does not exist.' })
  beginOwnershipTransfer(@Param('id') id: string, @Body() body: ResourceV2TransferOwnerDto, @Req() req: any) {
    return this.resources.beginOwnershipTransfer(id, body.username, Number(req.user.id), req.user?.role === 'admin' || req.user?.roles?.includes?.('admin'));
  }
}
