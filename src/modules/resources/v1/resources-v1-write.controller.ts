import {
  BadRequestException, Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Req, Res, UploadedFile,
  UseGuards, UseInterceptors, ValidationPipe,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { createHash } from 'crypto';
import { unlink } from 'fs/promises';
import { DataSource } from 'typeorm';
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
import { RESOURCE_KIND_VALUES } from '../resource-kind-registry';
import { ResourceDirectUploadService } from '../resource-direct-upload.service';
import { CompleteResourceDirectUploadDto, InitResourceDirectUploadDto, ResourceDirectUploadInitResponseDto, ResourceDirectUploadCompleteResponseDto, ResourceDirectUploadDraftResponseDto } from './resource-direct-upload.dto';

const duplicateResponseSchema = {
  type: 'object', required: ['exact', 'structure', 'normalized', 'existing_resources'],
  properties: {
    exact: { type: 'boolean', description: 'Exact file SHA-256 match; final submit is rejected with RESOURCE_DUPLICATE.' },
    structure: { type: 'boolean', description: 'Exact schematic structure match; submit needs duplicate_note.' },
    normalized: { type: 'boolean', description: 'Rotation/mirror normalized match; advisory only.' },
    existing_resources: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'integer', nullable: true }, public_id: { type: 'string', nullable: true },
      title: { type: 'string' }, status: { type: 'string' }, url: { type: 'string' },
    } } },
    similar_resources: { type: 'array', items: { type: 'object' } },
  },
};

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
    private readonly directUploads: ResourceDirectUploadService,
    private readonly dataSource: DataSource,
  ) {}

  @Post('uploads/init')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiBody({ type: InitResourceDirectUploadDto })
  @ApiCreatedResponse({ type: ResourceDirectUploadInitResponseDto, description: 'Creates an owner-bound RES direct upload session. The upload token is short lived; complete is always required.' })
  async initDirectUpload(@Body() rawBody: Record<string, any>, @Req() req: any) {
    await this.assertEnabled(req.user);
    const body = await this.validate(rawBody, InitResourceDirectUploadDto);
    return this.directUploads.init(body, req.user);
  }

  @Post('direct-drafts')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 5, window: 60 })
  @ApiConsumes('application/json')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'ASCII key scoped to the authenticated account; reuse only for the same direct-upload draft.' })
  @ApiBody({ type: CreateResourceDto, description: 'Creates an unpublished Resource and upload_pending first version without receiving the file bytes.' })
  @ApiCreatedResponse({ type: ResourceDirectUploadDraftResponseDto, description: 'Metadata-only direct-upload draft; call uploads/init and uploads/complete before it enters moderation.' })
  async createDirectUploadDraft(@Body() rawBody: Record<string, any>, @Req() req: any) {
    await this.assertEnabled(req.user);
    const body = await this.validate(rawBody, CreateResourceDto);
    const rawKey = req.headers?.['idempotency-key'];
    const key = typeof rawKey === 'string' ? rawKey : undefined;
    const userId = Number(req.user.id);

    // The generic submission idempotency row remains valid after a direct draft
    // has completed. Recover that successful result before re-entering the
    // initial-draft creator, whose open/upload_pending checks intentionally
    // reject mutation of a completed draft.
    const replay = await this.resources.findIdempotentReplay(userId, key, body as unknown as Record<string, unknown>);
    if (replay && key) {
      const keyHash = createHash('sha256').update(key.trim()).digest('hex');
      const rows = await this.dataSource.query(
        `SELECT draft.id, draft.expires_at, draft.status AS draft_status,
                version.public_id AS version_public_id, version.status AS version_status, version.revision
         FROM resource_direct_upload_drafts draft
         JOIN resource_versions version ON version.id=draft.resource_version_id
         WHERE draft.user_id=? AND draft.idempotency_key_hash=? AND version.resource_id=?
         ORDER BY draft.created_at DESC LIMIT 1`,
        [userId, keyHash, Number(replay.id)],
      ) as Array<{ id: string; expires_at: Date | string; draft_status: 'open' | 'completed'; version_public_id: string; version_status: string; revision: number | string }>;
      const draft = rows[0];
      if (draft && (draft.draft_status === 'completed' || new Date(draft.expires_at).getTime() > Date.now())) {
        return {
          resource_public_id: replay.public_id,
          resource_id: Number(replay.id),
          version_public_id: draft.version_public_id,
          upload_draft_id: draft.id,
          expires_at: new Date(draft.expires_at).toISOString(),
          draft_status: draft.draft_status,
          version_status: draft.version_status,
          revision: Number(draft.revision),
        };
      }
    }
    return this.resources.createDirectUploadDraft(body, userId, key, getClientIp(req));
  }

  @Post('uploads/complete')
  @OAuthProtected('resource.upload')
  @RateLimit({ max: 10, window: 60 })
  @ApiBody({ type: CompleteResourceDirectUploadDto })
  @ApiCreatedResponse({ type: ResourceDirectUploadCompleteResponseDto, description: 'Checks the verified RES object server-side, creates a pending ResourceFile, and binds it privately.' })
  async completeDirectUpload(@Body() rawBody: Record<string, any>, @Req() req: any) {
    await this.assertEnabled(req.user);
    const body = await this.validate(rawBody, CompleteResourceDirectUploadDto);
    return this.directUploads.complete(body.session_id, body.object_public_id, req.user);
  }

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
  @ApiCreatedResponse({ description: 'A private parsed draft and duplicate findings.', schema: { type: 'object', properties: {
    id: { type: 'string' }, preview_url: { type: 'string' }, parser_version: { type: 'string', nullable: true },
    metadata: { type: 'object', nullable: true }, duplicate: duplicateResponseSchema,
  } } })
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
    resource_kind: { type: 'string', enum: RESOURCE_KIND_VALUES }, file: { type: 'string', format: 'binary' },
  } } })
  @ApiCreatedResponse({ description: 'Creates a durable owner-bound upload draft in quarantine and returns exact duplicate findings.', schema: { type: 'object', properties: {
    id: { type: 'string' }, resource_kind: { type: 'string', enum: RESOURCE_KIND_VALUES }, expires_at: { type: 'string', format: 'date-time' }, duplicate: duplicateResponseSchema,
  } } })
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
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'ASCII key scoped to the authenticated user. Reuse it unchanged to replay the first submission result for 24 hours.' })
  @ApiParam({ name: 'draftId', type: 'string' })
  @ApiCreatedResponse({ description: 'Submits an owner-bound resource draft to existing forum moderation.' })
  async submitUploadDraft(@Param('draftId') draftId: string, @Body() rawBody: Record<string, any>, @Req() req: any) {
    const idempotencyKey = req.headers?.['idempotency-key'];
    const replay = await this.resources.findIdempotentReplay(req.user.id, idempotencyKey, { ...rawBody, preview_draft_id: draftId });
    if (replay) return this.submittedResource(replay);
    const draft = await this.previews.getDraft(req.user.id, draftId);
    return this.create({ ...draft.draft, ...rawBody, resource_type: 'upload', resource_kind: draft.resource_kind, preview_draft_id: draftId }, undefined, req, { ...rawBody, preview_draft_id: draftId });
  }

  @Get('drafts/:draftId/preview')
  @OAuthProtected('resource.upload')
  @RawHttpResponse()
  @ApiParam({ name: 'draftId', type: 'string' })
  @ApiOkResponse({ description: 'Legacy private preview image for the authenticated submitter.' })
  @ApiResponse({ status: 302, description: 'Redirects RES draft previews to a short-lived private URL.' })
  async draftPreview(@Param('draftId') draftId: string, @Req() req: any, @Res() res: Response) {
    const redirect = await this.previews.getDraftResPreviewUrl(req.user.id, draftId);
    if (redirect) {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.redirect(302, redirect);
    }
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
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'ASCII key scoped to the authenticated user. Same key and request replay the original result for 24 hours; a changed payload returns IDEMPOTENCY_KEY_REUSED.' })
  @ApiResponse({ status: 409, description: 'RESOURCE_DUPLICATE, RESOURCE_STRUCTURE_DUPLICATE, IDEMPOTENCY_KEY_REUSED, or IDEMPOTENCY_IN_PROGRESS.', schema: {
    type: 'object', properties: { error: { type: 'object', properties: {
      code: { type: 'string', enum: ['RESOURCE_DUPLICATE', 'RESOURCE_STRUCTURE_DUPLICATE', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_IN_PROGRESS'] },
      message: { type: 'string' }, existing_resource: { type: 'object', nullable: true }, existing_resources: { type: 'array', items: { type: 'object' } },
    } } },
  } })
  @ApiBody({ schema: { type: 'object', required: ['title', 'resource_type', 'version'], properties: {
    title: { type: 'string' }, resource_type: { type: 'string', enum: ['upload', 'external'] },
    resource_kind: { type: 'string', enum: RESOURCE_KIND_VALUES }, version: { type: 'string' }, description: { type: 'string' },
    duplicate_note: { type: 'string', maxLength: 2000, description: 'Required when an exact schematic structure already exists; stored with the resource.' },
    compatibility: { type: 'array', description: 'Publisher-declared compatibility. Renderer facts remain separate and cannot be overwritten.' },
    content: { type: 'string', description: 'Legacy Markdown projection; kept for compatibility.' },
    content_json: { type: 'object', description: 'Canonical Tiptap/ProseMirror document. Submitted as a JSON string in multipart requests.' },
    preview_draft_id: { type: 'string' }, schematic_code: { type: 'string' }, external_url: { type: 'string', format: 'uri' },
    file: { type: 'string', format: 'binary' },
  } } })
  @ApiCreatedResponse({ description: 'Submitted to moderation; same Idempotency-Key and request replay this result.', schema: { type: 'object', properties: {
    public_id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' }, created_at: { type: 'string', format: 'date-time', nullable: true },
  } } })
  async create(@Body() rawBody: Record<string, any>, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: any, idempotencyPayload?: unknown) {
    let storedFile: Awaited<ReturnType<ResourceStorageService['storeIncoming']>>;
    let rendererDraft: ConsumedResourcePreviewDraft | undefined;
    try {
      await this.assertEnabled(req.user);
      const body = await this.validate(rawBody, CreateResourceDto);
      const userId = req.user.id;
      const idempotencyKey = req.headers?.['idempotency-key'];
      if (body.preview_draft_id) {
        const replay = await this.resources.findIdempotentReplay(userId, idempotencyKey, (idempotencyPayload || body) as Record<string, unknown>);
        if (replay) return this.submittedResource(replay);
      }
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
      const resFile = storedFile ? await this.directUploads.uploadManagedFile(storedFile) : undefined;
      const resource = await this.resources.create(body, userId, resFile, {
        ipAddress: getClientIp(req), rendererDraft, idempotencyKey,
        idempotencyPayload: idempotencyPayload || body,
      });
      if (storedFile?.file_path) await this.storage.removeManaged(storedFile.file_path).catch(() => undefined);
      return this.submittedResource(resource);
    } catch (error) {
      await cleanupUploadedFile(file);
      if (storedFile?.file_path) await unlink(storedFile.file_path).catch(() => undefined);
      if (rendererDraft) await this.previews.discardConsumedDraft(rendererDraft);
      throw error;
    }
  }

  private submittedResource(resource: any) {
    return {
      public_id: resource.public_id,
      title: resource.title,
      status: resource.status,
      created_at: resource.created_at?.toISOString?.() ?? (typeof resource.created_at === 'string' ? resource.created_at : null),
    };
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
