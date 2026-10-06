import {
  BadRequestException, Body, Controller, HttpStatus, Optional, Param, Patch, Post, Req, Res, ServiceUnavailableException, UploadedFile, UseInterceptors, ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBody, ApiConsumes, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader,
  ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags,
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
  ResourceV2ExportSchematicDto, ResourceV2PatchProfileDto, ResourceV2RespondInvitationDto, ResourceV2TransferOwnerDto,
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
  ) {}

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

  @Post(':id/versions/:versionId/schematic-editor/export')
  @RawHttpResponse()
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 5, window: 60 })
  @ApiOperation({ operationId: 'exportResourceSchematicEdit', summary: '安全导出编辑后的蓝图副本', description: 'Owner/Maintainer 可对已发布蓝图执行旋转、水平镜像和删除选中方块。只读取托管版本并返回新文件，不修改原版本。' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Resource public UUID。' })
  @ApiParam({ name: 'versionId', format: 'uuid', description: '已发布 Version public UUID。' })
  @ApiConsumes('application/json')
  @ApiBody({ type: ResourceV2ExportSchematicDto })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'An official Mindustry .msch serialization as a downloadable file.', schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ description: '操作无效、文件无法解析或含有编辑器不支持安全保留的内容。' })
  @ApiForbiddenResponse({ description: '当前用户不是该资源的 Owner 或 Maintainer。' })
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
    const result = await this.resources.exportSchematic(id, versionId, body, Number(req.user.id));
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', attachmentContentDisposition(result.file_name));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.send(result.data);
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
