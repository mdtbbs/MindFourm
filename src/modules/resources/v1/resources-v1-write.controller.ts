import {
  BadRequestException, Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Req, Res, UploadedFile,
  UseGuards, UseInterceptors, ValidationPipe,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { unlink } from 'fs/promises';
import { ApiV1, RawHttpResponse } from '../../../common/decorators/api-v1.decorator';
import { ApiV1Exception } from '../../../common/exceptions/api-v1.exception';
import { OAuthProtected } from '../../../common/decorators/oauth-protected.decorator';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { assertSafeUploadedFile } from '../../../common/utils/upload-safety.util';
import { getClientIp } from '../../../common/utils/client-context.util';
import { AuthService } from '../../auth/auth.service';
import { SettingsService } from '../../settings/settings.service';
import { ResourcesService } from '../resources.service';
import { ResourceStorageService } from '../resource-storage.service';
import { ConsumedResourcePreviewDraft, ResourcePreviewService } from '../resource-preview.service';
import { CreateResourceDto } from '../dto/create-resource.dto';
import { CreateResourcePreviewDraftDto } from '../dto/create-resource-preview-draft.dto';
import { CreateResourceUploadDraftDto } from '../dto/create-resource-upload-draft.dto';
import { UpdateResourceUploadDraftDto } from '../dto/update-resource-upload-draft.dto';
import { cleanupUploadedFile, MAX_RESOURCE_SIZE, resourcePreviewDraftInterceptor, resourceUploadInterceptor } from '../resources.controller';

@ApiV1()
@ApiTags('v1-resource-uploads')
@Controller('v1/resources')
export class ResourcesV1WriteController {
  constructor(
    private readonly resources: ResourcesService,
    private readonly storage: ResourceStorageService,
    private readonly previews: ResourcePreviewService,
    private readonly settings: SettingsService,
    private readonly auth: AuthService,
  ) {}

  @Post('drafts/preview')
  @OAuthProtected('resource.upload')
  @UseInterceptors(resourcePreviewDraftInterceptor)
  @RateLimit({ max: 5, window: 60 })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['resource_kind'], properties: {
    resource_kind: { type: 'string', enum: ['map', 'schematic'] },
    schematic_code: { type: 'string', maxLength: 29360128 },
    file: { type: 'string', format: 'binary' },
  } } })
  @ApiCreatedResponse({ description: 'A private, short-lived, user-bound parsed resource draft.' })
  async previewDraft(@Body() rawBody: Record<string, any>, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: any) {
    let storedFile: Awaited<ReturnType<ResourceStorageService['storeIncoming']>>;
    try {
      await this.assertEnabled(req.user);
      const body = await this.validate(rawBody, CreateResourcePreviewDraftDto);
      const schematicCode = body.schematic_code?.trim();
      if (file && schematicCode) throw new BadRequestException('蓝图请在上传文件和粘贴代码中二选一');
      if (body.resource_kind === 'map' && (!file || schematicCode)) throw new BadRequestException('地图请上传 .msav 文件');
      if (body.resource_kind === 'schematic' && !file && !schematicCode) throw new BadRequestException('请上传 .msch 文件或粘贴蓝图代码');
      if (file) {
        const expectedExtension = body.resource_kind === 'map' ? '.msav' : '.msch';
        if (!file.originalname.toLowerCase().endsWith(expectedExtension)) throw new BadRequestException(`文件仅支持 ${expectedExtension}`);
        await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      }
      storedFile = schematicCode
        ? await this.storage.storePastedSchematic(schematicCode)
        : await this.storage.storeIncoming(file);
      if (!storedFile) throw new BadRequestException('请选择要预览的文件');
      return await this.previews.createDraft(req.user.id, body.resource_kind, storedFile);
    } catch (error) {
      await cleanupUploadedFile(file);
      if (storedFile?.file_path) await this.storage.removeManaged(storedFile.file_path).catch(() => undefined);
      throw error;
    }
  }

  @Post('drafts')
  @OAuthProtected('resource.upload')
  @UseInterceptors(resourceUploadInterceptor)
  @RateLimit({ max: 5, window: 60 })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['resource_kind', 'file'], properties: {
    resource_kind: { type: 'string' }, file: { type: 'string', format: 'binary' },
  } } })
  @ApiCreatedResponse({ description: 'Creates a durable owner-bound upload draft in quarantine.' })
  async createUploadDraft(@Body() rawBody: Record<string, any>, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: any) {
    let storedFile: Awaited<ReturnType<ResourceStorageService['storeIncoming']>>;
    try {
      await this.assertEnabled(req.user);
      const body = await this.validate(rawBody, CreateResourceUploadDraftDto);
      if (!file) throw new BadRequestException('请选择要上传的资源文件');
      await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      storedFile = await this.storage.storeIncoming(file);
      if (!storedFile) throw new BadRequestException('请选择要上传的资源文件');
      return await this.previews.createUploadDraft(req.user.id, body.resource_kind, storedFile);
    } catch (error) {
      await cleanupUploadedFile(file);
      if (storedFile?.file_path) await this.storage.removeManaged(storedFile.file_path).catch(() => undefined);
      throw error;
    }
  }

  @Get('drafts/:draftId')
  @OAuthProtected('resource.upload')
  @ApiParam({ name: 'draftId', type: 'string' })
  @ApiOkResponse({ description: 'Owner-only draft metadata; quarantine paths are never returned.' })
  async getUploadDraft(@Param('draftId') draftId: string, @Req() req: any) {
    await this.assertEnabled(req.user);
    return this.previews.getDraft(req.user.id, draftId);
  }

  @Patch('drafts/:draftId')
  @OAuthProtected('resource.upload')
  @ApiParam({ name: 'draftId', type: 'string' })
  @ApiOkResponse({ description: 'Updates editable resource draft metadata.' })
  async updateUploadDraft(@Param('draftId') draftId: string, @Body() rawBody: Record<string, any>, @Req() req: any) {
    await this.assertEnabled(req.user);
    const body = await this.validate(rawBody, UpdateResourceUploadDraftDto);
    return this.previews.updateDraft(req.user.id, draftId, body as Record<string, unknown>);
  }

  @Delete('drafts/:draftId')
  @OAuthProtected('resource.upload')
  @ApiParam({ name: 'draftId', type: 'string' })
  @ApiOkResponse({ description: 'Deletes an owner-bound quarantine draft and its private files.' })
  async deleteUploadDraft(@Param('draftId') draftId: string, @Req() req: any) {
    await this.assertEnabled(req.user);
    await this.previews.deleteUserDraft(req.user.id, draftId);
    return { deleted: true };
  }

  @Post('drafts/:draftId/submit')
  @OAuthProtected('resource.upload')
  @ApiParam({ name: 'draftId', type: 'string' })
  @ApiCreatedResponse({ description: 'Submits an owner-bound resource draft to existing forum moderation.' })
  async submitUploadDraft(@Param('draftId') draftId: string, @Body() rawBody: Record<string, any>, @Req() req: any) {
    const draft = await this.previews.getDraft(req.user.id, draftId);
    return this.create({ ...draft.draft, ...rawBody, resource_type: 'upload', resource_kind: draft.resource_kind, preview_draft_id: draftId }, undefined, req);
  }

  @Get('drafts/:draftId/preview')
  @OAuthProtected('resource.upload')
  @RawHttpResponse()
  @ApiParam({ name: 'draftId', type: 'string' })
  @ApiOkResponse({ description: 'Private preview image for the authenticated submitter.' })
  async draftPreview(@Param('draftId') draftId: string, @Req() req: any, @Res() res: Response) {
    const image = await this.previews.readDraftPreview(req.user.id, draftId);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(image);
  }

  @Post()
  @OAuthProtected('resource.upload')
  @UseInterceptors(resourceUploadInterceptor)
  @RateLimit({ max: 5, window: 60 })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['title', 'resource_type', 'version'], properties: {
    title: { type: 'string' }, resource_type: { type: 'string', enum: ['upload', 'external'] },
    resource_kind: { type: 'string' }, version: { type: 'string' }, description: { type: 'string' },
    content: { type: 'string', description: 'Legacy Markdown projection; kept for compatibility.' },
    content_json: { type: 'object', description: 'Canonical Tiptap/ProseMirror document. Submitted as a JSON string in multipart requests.' },
    preview_draft_id: { type: 'string' }, schematic_code: { type: 'string' }, external_url: { type: 'string', format: 'uri' },
    file: { type: 'string', format: 'binary' },
  } } })
  @ApiCreatedResponse({ description: 'Submitted to the existing resource moderation lifecycle.' })
  async create(@Body() rawBody: Record<string, any>, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: any) {
    let storedFile: Awaited<ReturnType<ResourceStorageService['storeIncoming']>>;
    let rendererDraft: ConsumedResourcePreviewDraft | undefined;
    try {
      await this.assertEnabled(req.user);
      const body = await this.validate(rawBody, CreateResourceDto);
      const userId = req.user.id;
      const schematicCode = body.schematic_code?.trim();
      const previewDraftId = body.preview_draft_id?.trim();
      if (body.resource_type === 'external' && file) throw new BadRequestException('外链资源不能同时上传本站托管文件');
      if (schematicCode && (body.resource_kind !== 'schematic' || body.resource_type !== 'upload')) throw new BadRequestException('粘贴蓝图代码仅可用于本站托管的蓝图资源');
      if (file && schematicCode) throw new BadRequestException('蓝图请在上传文件和粘贴代码中二选一');
      if (previewDraftId && (file || schematicCode)) throw new BadRequestException('已生成预览的资源不能再次上传文件或粘贴蓝图代码');
      if (file) await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      if (previewDraftId) {
        rendererDraft = await this.previews.consumeDraft(userId, previewDraftId, body.resource_kind || '');
        storedFile = rendererDraft.file;
      } else storedFile = schematicCode
          ? await this.storage.storePastedSchematic(schematicCode)
          : await this.storage.storeIncoming(file);
      const resource = await this.resources.create(body, userId, storedFile, { ipAddress: getClientIp(req), rendererDraft });
      return {
        public_id: resource.public_id,
        title: resource.title,
        status: resource.status,
        created_at: resource.created_at?.toISOString?.() ?? null,
      };
    } catch (error) {
      await cleanupUploadedFile(file);
      if (storedFile?.file_path) await unlink(storedFile.file_path).catch(() => undefined);
      if (rendererDraft) await this.previews.discardConsumedDraft(rendererDraft);
      throw error;
    }
  }

  private async assertEnabled(user: any) {
    if (!await this.settings.getBoolean('feature_resources_v1_upload_enabled', true)) {
      throw new ApiV1Exception('RESOURCE_UPLOAD_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭资源上传', false);
    }
    if (await this.auth.checkNeedsTermsAcceptance(user)) {
      throw new ApiV1Exception('TERMS_ACCEPTANCE_REQUIRED', HttpStatus.FORBIDDEN, '请先接受社区条款', false);
    }
  }

  private validate<T extends object>(body: Record<string, any>, type: new () => T): Promise<T> {
    if (typeof body.content_json === 'string') {
      try { body = { ...body, content_json: JSON.parse(body.content_json) }; }
      catch { throw new BadRequestException('content_json 必须是合法 JSON'); }
    }
    return new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
      .transform(body, { type: 'body', metatype: type }) as Promise<T>;
  }
}
