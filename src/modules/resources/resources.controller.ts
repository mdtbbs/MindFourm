import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import {
  Controller,
  Get,
  Header,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  StreamableFile,
  BadRequestException, ServiceUnavailableException,
  Optional,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { mkdirSync, createReadStream } from 'fs';
import { Response } from 'express';
import { ResourcesService } from './resources.service';
import { ResourceCategoryService } from './resource-categories.service';
import { ResourceVersionService } from './resource-versions.service';
import { ResourceFavoritesService } from './resource-favorites.service';
import { ResourceLikesService } from './resource-likes.service';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { CreateResourcePreviewDraftDto } from './dto/create-resource-preview-draft.dto';
import { QueryResourcesDto } from './dto/query-resources.dto';
import { CreateResourceCategoryDto } from './dto/create-resource-category.dto';
import { UpdateResourceCategoryDto } from './dto/update-resource-category.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { OptionalAuth } from '@common/decorators/public.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { RawHttpResponse } from '@common/decorators/api-v1.decorator';
import { assertSafeRedirectUrl } from '@common/utils/safe-url.util';
import { attachmentContentDisposition } from '@common/utils/content-disposition.util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourceStorageService } from './resource-storage.service';
import { LogsService } from '../logs/logs.service';
import { getClientIp } from '@common/utils/client-context.util';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { ResourceLifecycleService } from './resource-lifecycle.service';
import { ResourceSubscriptionsService } from './resource-subscriptions.service';
import { ResourcePreviewService } from './resource-preview.service';
import { ResourceV2ExportMapDto, ResourceV2ExportSchematicDto } from './v2/resources-v2-write.dto';
import { analyzeSchematicMetadata } from './analyzers/schematic-analyzer';
import { RESOURCE_KINDS } from './resource-kind-registry';
import { ResourceDuplicateService } from './resource-duplicate.service';
import { SiteConfigService } from '@config/site-profile';
import { buildResourceExportManifest, parseResourceImportManifest } from './resource-transfer.util';
import { isSafeExternalUrl } from '@common/utils/safe-url.util';
import { ResourceViewsService } from './resource-views.service';
import { DownloadPolicyService } from '../downloads/download-policy.service';
import { ResourceDirectUploadService } from './resource-direct-upload.service';
import { ResourceFileProviderService } from './resource-file-provider.service';
import { DownloadGrantService } from '../downloads/download-grant.service';
import { ResourceOperationsService } from './resource-operations.service';

const RESOURCE_INCOMING_DIR = './uploads/.incoming/resources';
export const MAX_RESOURCE_SIZE = 50 * 1024 * 1024;
const ALLOWED_RESOURCE_EXTENSIONS = new Set([
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.jar',
  '.msav',
  '.msch',
  '.json',
  '.hjson',
  '.txt',
  '.md',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
]);

function resourceFileFilter(
  _req: any,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_RESOURCE_EXTENSIONS.has(ext)) {
    callback(new BadRequestException('Resource file type is not allowed'), false);
    return;
  }

  callback(null, true);
}

function createResourceFileInterceptor() {
  return FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, callback) => {
      mkdirSync(RESOURCE_INCOMING_DIR, { recursive: true });
      callback(null, RESOURCE_INCOMING_DIR);
    },
    filename: (_req, file, callback) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      callback(null, `${uniqueSuffix}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_RESOURCE_SIZE, fieldSize: 28 * 1024 * 1024 },
  fileFilter: resourceFileFilter,
  });
}

export const resourceUploadInterceptor = createResourceFileInterceptor();
export const resourcePreviewDraftInterceptor = createResourceFileInterceptor();

function normalizeCategoryBody(body: any): any {
  const normalized: Record<string, unknown> = {
    name: body.name,
    slug: body.slug,
    description: body.description || null,
    icon: body.icon || null,
    sort_order: body.sort_order !== undefined ? Number(body.sort_order) : undefined,
  };

  if (body.is_active !== undefined) {
    normalized.is_active = body.is_active === false || body.is_active === 'false' ? 0 : 1;
  }

  return normalized;
}

export async function cleanupUploadedFile(file?: Express.Multer.File): Promise<void> {
  if (!file?.path) return;
  await fs.unlink(file.path).catch(() => undefined);
}

@Controller('resources')
export class ResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly categoryService: ResourceCategoryService,
    private readonly versionService: ResourceVersionService,
    private readonly favoritesService: ResourceFavoritesService,
    private readonly likesService: ResourceLikesService,
    private readonly resourceStorageService: ResourceStorageService,
    private readonly logsService: LogsService,
    private readonly resourceLifecycleService: ResourceLifecycleService,
    private readonly subscriptionsService: ResourceSubscriptionsService,
    private readonly resourcePreviewService: ResourcePreviewService,
    private readonly duplicateService: ResourceDuplicateService,
    private readonly siteConfig: SiteConfigService,
    private readonly resourceViews: ResourceViewsService,
    private readonly downloadPolicy: DownloadPolicyService,
    private readonly resourceOperations: ResourceOperationsService,
    @Optional() private readonly directUploads?: ResourceDirectUploadService,
    @Optional() private readonly fileProvider?: ResourceFileProviderService,
    @Optional() private readonly downloadGrants?: DownloadGrantService,
    @Optional() private readonly editorCapabilities?: CapabilitiesService,
  ) {}

  @Get()
  async getList(@Query() query: QueryResourcesDto) {
    return this.resourcesService.getList(query, { scope: 'public' });
  }

  @Get('hot')
  async getHotResources() {
    return this.resourcesService.getHotResources();
  }

  @Get('filter-options')
  async getFilterOptions() {
    return this.resourcesService.getFilterOptions();
  }

  @Get('kinds')
  async listKinds() {
    return RESOURCE_KINDS;
  }

  @Get('topics')
  async listTopics() {
    return this.categoryService.getPublicCategories();
  }

  @Post('duplicates/check')
  @UseGuards(JwtAuthGuard)
  async checkDuplicate(@Body() body: { content_hash?: string; structure_hash?: string; normalized_structure_hash?: string; resource_kind?: string; source_url?: string; title?: string }) {
    if (body.content_hash && !/^[a-f0-9]{64}$/i.test(body.content_hash)) throw new BadRequestException('SHA-256 格式无效');
    return this.duplicateService.inspect({
      contentHash: body.content_hash?.toLowerCase(),
      structureHash: body.structure_hash?.toLowerCase(),
      normalizedStructureHash: body.normalized_structure_hash?.toLowerCase(),
      resourceKind: body.resource_kind,
      sourceUrl: body.source_url,
      title: body.title,
    });
  }

  @Get('content-metadata')
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  async getMindustryContentMetadata(
    @Query('items') items = '',
    @Query('blocks') blocks = '',
    @Query('liquids') liquids = '',
  ) {
    const parseIds = (value: string) => value.split(',').filter(Boolean);
    return this.resourcePreviewService.resolveContentMetadata(parseIds(items), parseIds(blocks), parseIds(liquids));
  }

  @Get('user/:userId')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getUserResources(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: QueryResourcesDto,
    @Req() req?: any,
  ) {
    // Public endpoint: only returns approved and public resources
    return this.resourcesService.getPublicByUserId(
      userId,
      query.limit,
      query.cursor,
      query.page,
    );
  }

  @Get('categories')
  async listCategories() {
    return this.categoryService.getPublicCategories();
  }

  @Get('categories/tree')
  async listCategoriesTree() {
    // Kept as a compatibility endpoint for older clients; categories are now
    // intentionally flat and use the same response as the public endpoint.
    return this.categoryService.getCategoriesTree();
  }

  @Get('categories/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async listAdminCategories() {
    return this.categoryService.getAllCategories();
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createCategory(@Body() body: CreateResourceCategoryDto) {
    return this.categoryService.create(normalizeCategoryBody(body));
  }

  @Put('categories/:categoryId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateCategory(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() body: UpdateResourceCategoryDto,
  ) {
    return this.categoryService.update(categoryId, normalizeCategoryBody(body));
  }

  @Delete('categories/:categoryId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteCategory(@Param('categoryId', ParseIntPipe) categoryId: number) {
    await this.categoryService.delete(categoryId);
    return { message: 'Category deleted successfully' };
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async getAdminList(@Query() query: QueryResourcesDto) {
    return this.resourcesService.getList(query, { scope: 'admin' });
  }

  @Get('admin/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async getResourceAnalytics(@Query('range_days') rawRange: string | undefined, @Req() req: any) {
    const range = Number(rawRange);
    const rangeDays = ([1, 7, 30, 90].includes(range) ? range : 7) as 1 | 7 | 30 | 90;
    await this.logOperation(req, 'resource.analytics.view', undefined, {
      range_days: rangeDays,
      request_id: req.requestId || req.headers?.['x-request-id'] || null,
      source: 'admin-resource-analytics',
    });
    return this.resourceViews.getAnalytics(rangeDays);
  }

  @Get('admin/:id/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async getSingleResourceAnalytics(
    @Param('id', ParseIntPipe) id: number,
    @Query('range_days') rawRange: string | undefined,
    @Req() req: any,
  ) {
    await this.resourcesService.getById(id, req.user);
    const range = Number(rawRange);
    const rangeDays = ([1, 7, 30, 90].includes(range) ? range : 7) as 1 | 7 | 30 | 90;
    await this.logOperation(req, 'resource.analytics.view', id, {
      range_days: rangeDays,
      request_id: req.requestId || req.headers?.['x-request-id'] || null,
      source: 'admin-resource-detail-analytics',
    });
    return this.resourceViews.getAnalytics(rangeDays, id);
  }

  @Get('admin/:id/export-manifest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async exportManifest(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const resource = await this.resourcesService.getTransferExportData(id, req.user);
    return buildResourceExportManifest(resource, this.siteConfig.current);
  }

  @Post('admin/import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UseInterceptors(resourceUploadInterceptor)
  @RateLimit({ max: 5, window: 60 })
  async importManifest(
    @Body() rawBody: Record<string, any>,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    let storedFile: Awaited<ReturnType<ResourceStorageService['storeIncoming']>> | undefined;
    try {
      const manifest = parseResourceImportManifest(rawBody.manifest, this.siteConfig.current.profile);
      const payload = { ...manifest.resource } as Record<string, any>;
      delete payload.file_name;
      delete payload.file_download_url;
      if (typeof payload.content_json === 'string') {
        try { payload.content_json = JSON.parse(payload.content_json); }
        catch { throw new BadRequestException('Manifest content_json must be valid JSON'); }
      }
      if (rawBody.category_id !== undefined && rawBody.category_id !== '') payload.category_id = rawBody.category_id;
      if (rawBody.is_public !== undefined && rawBody.is_public !== '') payload.is_public = rawBody.is_public;

      const dto = await new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }).transform(payload, { type: 'body', metatype: CreateResourceDto });
      if (dto.resource_type === 'upload' && !file) {
        throw new BadRequestException('Upload resources need a local file selected for import.');
      }
      if (dto.resource_type === 'external' && file) {
        throw new BadRequestException('External resources must not include an uploaded file.');
      }
      if (dto.resource_type === 'external' && dto.external_url && !isSafeExternalUrl(dto.external_url)) {
        throw new BadRequestException('The external resource URL must be a public HTTP or HTTPS address.');
      }
      if (file) await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      if (file) storedFile = await this.resourceStorageService.storeIncoming(file);

      const resFile = storedFile ? await this.directUploads?.uploadManagedFile(storedFile) : undefined;
      if (storedFile && !resFile) throw new BadRequestException('资源存储服务暂不可用，请稍后重试');
      const resource = await this.resourcesService.create(dto, Number(req.user.id), resFile, {
        ipAddress: getClientIp(req),
        origin: {
          site: manifest.origin.site,
          resourceId: manifest.origin.resource_id,
          url: manifest.origin.url,
        },
      });
      if (storedFile?.file_path) await this.resourceStorageService.removeManaged(storedFile.file_path).catch(() => undefined);
      await this.logOperation(req, 'resource.import', resource.id, {
        origin_site: manifest.origin.site,
        origin_resource_id: manifest.origin.resource_id,
      });
      return { resource };
    } catch (error) {
      await cleanupUploadedFile(file);
      if (storedFile?.file_path) await fs.unlink(storedFile.file_path).catch(() => undefined);
      throw error;
    }
  }

  @Get('admin/:sourceId/merge-preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async previewMerge(
    @Param('sourceId', ParseIntPipe) sourceId: number,
    @Query('target_id', ParseIntPipe) targetId: number,
  ) {
    return this.resourcesService.previewResourceMerge(sourceId, targetId);
  }

  @Post('admin/:sourceId/merge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async mergeResource(
    @Param('sourceId', ParseIntPipe) sourceId: number,
    @Body() body: { target_id: number },
    @Req() req: any,
  ) {
    if (!Number.isInteger(Number(body.target_id)) || Number(body.target_id) <= 0) throw new BadRequestException('目标资源 ID 无效');
    return this.resourcesService.mergeResource(sourceId, Number(body.target_id), Number(req.user.id));
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMyResources(@Query() query: QueryResourcesDto, @Req() req: any) {
    return this.resourcesService.getByUserId(req.user.id, query.limit, query.cursor);
  }

  @Get('editor/catalog')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'public, max-age=3600')
  async editorCatalog() { if (!this.editorCapabilities) throw new ServiceUnavailableException('编辑器暂不可用'); await this.editorCapabilities.assertEditorAvailable('schematic'); return this.resourcePreviewService.editorCatalog(); }

  @SkipPhoneVerification()
  @Post('editor/:kind/analyze')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(resourcePreviewDraftInterceptor)
  @RateLimit({ max: 5, window: 60 })
  async analyzeEditorFile(@Param('kind') kind: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.withEditorFile(kind, file, async (stored, editorKind) => {
      const result = await this.resourcePreviewService.analyzeEditorFile(editorKind, stored);
      return { ...result, blocks: editorKind === 'schematic' ? analyzeSchematicMetadata(result.metadata).blocks.map(block => ({
        internal_name: block.internal_name, display_name: block.display_name, count: block.count, positions: block.positions_json || [],
      })) : [] };
    });
  }

  @SkipPhoneVerification()
  @Post('editor/:kind/export')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @RawHttpResponse()
  @UseInterceptors(resourcePreviewDraftInterceptor)
  @RateLimit({ max: 5, window: 60 })
  async exportEditorFile(@Param('kind') kind: string, @Body('operations') raw: string,
    @UploadedFile() file: Express.Multer.File | undefined, @Res() res: Response) {
    return this.withEditorFile(kind, file, async (stored, editorKind) => {
      let input: unknown;
      try { input = JSON.parse(raw); } catch { throw new BadRequestException('编辑操作格式无效'); }
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      const operations = await pipe.transform(input, { type: 'body', metatype: editorKind === 'schematic' ? ResourceV2ExportSchematicDto : ResourceV2ExportMapDto });
      const source = await this.resourceStorageService.readManagedFile(stored.file_path, 20 * 1024 * 1024);
      const result = editorKind === 'schematic'
        ? await this.resourcePreviewService.transformSchematic(stored.file_name, source, operations)
        : await this.resourcePreviewService.transformMap(stored.file_name, source, operations);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', attachmentContentDisposition(`edited.${editorKind === 'schematic' ? 'msch' : 'msav'}`));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(result.data);
    });
  }

  @SkipPhoneVerification()
  @Post('editor/map/region')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(resourcePreviewDraftInterceptor)
  @RateLimit({ max: 20, window: 60 })
  async editorMapRegion(@Query('x') x: string, @Query('y') y: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.withEditorFile('map', file, async stored => this.resourcePreviewService.mapRegion(
      await this.resourceStorageService.readManagedFile(stored.file_path, 20 * 1024 * 1024), Number(x), Number(y)));
  }

  private async withEditorFile<T>(kind: string, file: Express.Multer.File | undefined,
    action: (stored: NonNullable<Awaited<ReturnType<ResourceStorageService['storeIncoming']>>>, kind: 'map' | 'schematic') => Promise<T>): Promise<T> {
    let stored: Awaited<ReturnType<ResourceStorageService['storeIncoming']>>;
    try {
      if (!this.editorCapabilities) throw new ServiceUnavailableException('编辑器暂不可用');
      await this.editorCapabilities.assertEditorAvailable(kind === 'map' ? 'map' : 'schematic');
      if (kind !== 'map' && kind !== 'schematic') throw new BadRequestException('不支持的编辑器类型');
      if (!file || !file.originalname.toLowerCase().endsWith(kind === 'map' ? '.msav' : '.msch')) throw new BadRequestException('请选择正确的地图或蓝图文件');
      await assertSafeUploadedFile(file, 20 * 1024 * 1024);
      stored = await this.resourceStorageService.storeIncoming(file);
      if (!stored) throw new BadRequestException('请选择文件');
      return await action(stored, kind);
    } finally {
      await cleanupUploadedFile(file);
      if (stored?.file_path) await this.resourceStorageService.removeManaged(stored.file_path);
    }
  }

  @Post('drafts/preview')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(resourcePreviewDraftInterceptor)
  @RateLimit({ max: 5, window: 60 })
  async previewDraft(
    @Body() rawBody: Record<string, any>,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    let storedFile: Awaited<ReturnType<ResourceStorageService['storeIncoming']>>;
    try {
      const body = await new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }).transform(rawBody, { type: 'body', metatype: CreateResourcePreviewDraftDto });
      const schematicCode = body.schematic_code?.trim();
      if (file && schematicCode) throw new BadRequestException('蓝图请在上传文件和粘贴代码中二选一');
      if (body.resource_kind === 'map' && (!file || schematicCode)) {
        throw new BadRequestException('地图请上传 .msav 文件');
      }
      if (body.resource_kind === 'schematic' && !file && !schematicCode) {
        throw new BadRequestException('请上传 .msch 文件或粘贴蓝图代码');
      }
      if (file) {
        const expectedExtension = body.resource_kind === 'map' ? '.msav' : '.msch';
        if (!file.originalname.toLowerCase().endsWith(expectedExtension)) {
          throw new BadRequestException(`${body.resource_kind === 'map' ? '地图' : '蓝图'}仅支持 ${expectedExtension} 文件`);
        }
      }
      if (file) await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      storedFile = schematicCode
        ? await this.resourceStorageService.storePastedSchematic(schematicCode)
        : await this.resourceStorageService.storeIncoming(file);
      if (!storedFile) throw new BadRequestException('请选择要预览的文件');
      return await this.resourcePreviewService.createDraft(req.user.id, body.resource_kind, storedFile);
    } catch (error) {
      await cleanupUploadedFile(file);
      if (storedFile?.file_path) await this.resourceStorageService.removeManaged(storedFile.file_path).catch(() => undefined);
      throw error;
    }
  }

  @Get('drafts/:draftId/preview')
  @RawHttpResponse()
  @UseGuards(JwtAuthGuard)
  async getDraftPreview(@Param('draftId') draftId: string, @Req() req: any, @Res() res: Response) {
    const redirect = await this.resourcePreviewService.getDraftResPreviewUrl(req.user.id, draftId);
    if (redirect) {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.redirect(302, redirect);
    }
    const preview = await this.resourcePreviewService.readDraftPreview(req.user.id, draftId);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(preview);
  }

  @Get(':id/render-status')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getRenderStatus(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.resourcesService.getById(id, req?.user);
  }

  @Get(':id/preview')
  @RawHttpResponse()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getPreview(@Param('id', ParseIntPipe) id: number, @Req() req: any, @Res() res: Response) {
    const resource = await this.resourcesService.getForFileAccess(id, req?.user);

    const resUrl = await this.resourcePreviewService.getResPreviewUrl(resource);
    if (resUrl) return res.redirect(302, resUrl);
    const preview = await this.resourcePreviewService.readPreview(resource);
    if (!preview) throw new NotFoundException('预览尚未生成');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(preview);
  }

  @Get(':id')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getById(@Param('id') identifier: string | number, @Req() req: any, @Res() res?: Response) {
    const id = typeof identifier === 'number' ? identifier : await this.resourcesService.resolveDetailId(identifier);
    const canonicalId = await this.resourcesService.findMergedResourceTarget(id);
    if (canonicalId) {
      if (!res) return { url: `/api/resources/${canonicalId}`, statusCode: 301 };
      res.redirect(301, `/api/resources/${canonicalId}`);
      return;
    }

    const resource = await this.resourcesService.getByIdWithVersions(id, req?.user);
    if (!res) return resource;
    res.json({ success: true, data: resource });
  }

  @Get(':id/related')
  async getRelated(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    return this.resourcesService.getRelatedResources(id, Number(limit) || 6);
  }

  @Get(':id/view')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  async recordView(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resource = await this.resourcesService.getById(id, req?.user);
    const recorded = await this.resourceViews.recordRequest(resource, req, res);
    return {
      recorded,
      view_count: Number(resource.view_count || 0) + (recorded ? 1 : 0),
    };
  }

  @Get(':id/download')
  @RawHttpResponse()
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @RateLimit({ max: 60, window: 60 })
  async download(
    @Param('id', ParseIntPipe) id: number,
    @Query('version_id') versionId: string | undefined,
    @Res({ passthrough: true }) res: Response,
    @Req() req?: any,
  ) {
    // Resolve storage fields internally, with the same visibility rules as the public DTO.
    const resource = await this.resourcesService.getForFileAccess(id, req?.user);
    await this.downloadPolicy.assertDownloadAuthentication(resource.resource_kind, req?.user);

    if (versionId && (!Number.isSafeInteger(Number(versionId)) || Number(versionId) < 1)) throw new BadRequestException('Invalid version id');
    const stored = await this.resourcesService.findStoredDownloadFile?.(id, versionId ? Number(versionId) : undefined, req?.user);
    if (stored?.file.storage_backend === 'res') {
      if (!this.fileProvider || !this.downloadGrants) throw new NotFoundException('资源文件暂不可用');
      const privateFile = !['approved', 'published'].includes(resource.status) || Number(resource.is_public) !== 1
        || resource.visibility === 'private' || stored.version.status !== 'published' || stored.file.availability_status !== 'available';
      const downloadTarget = await this.fileProvider.getDownloadTarget(stored.file, { private: privateFile });
      if (downloadTarget.kind !== 'redirect') throw new NotFoundException('资源文件暂不可用');
      const userId = req?.user?.id || null;
      await this.downloadGrants.recordGrant({
        resourceId: id, versionId: stored.version.id, fileId: stored.file.id, userId,
        grantedAt: new Date(), clientType: 'web', clientVersion: null, platform: null, backend: 'res',
      }, userId ? `user:${userId}` : `ipua:${getClientIp(req || {}) || 'unknown'}:${String(req?.headers?.['user-agent'] || '')}`);
      return res.redirect(302, downloadTarget.url);
    }

    // MFL redirect: if resource uses MFL, redirect to MFL download URL
    if (!versionId && resource.use_mfl && (resource.mfl_file_id || resource.mfl_download_url)) {
      const mflUrl = resource.mfl_file_id
        ? await this.resourcesService.resolveMflDownloadUrl(resource.mfl_file_id, resource.mfl_download_url)
        : resource.mfl_download_url;
      assertSafeRedirectUrl(mflUrl);
      await this.resourcesService.incrementDownload(id);
      return res.redirect(mflUrl);
    }

    if (!versionId && resource.resource_type === 'external' && resource.external_url) {
      // Validated again at redirect time: rows predating the DTO's @IsUrl check may
      // still hold a `javascript:` or `data:` URL.
      assertSafeRedirectUrl(resource.external_url);
      await this.resourcesService.incrementDownload(id);
      return res.redirect(resource.external_url);
    }

    if (versionId && !Number.isFinite(Number(versionId))) {
      throw new BadRequestException('Invalid version id');
    }

    const target = versionId
      ? await this.versionService.getDownloadTarget(id, Number(versionId), req?.user)
      : resource;

    if (!target.file_path) {
      throw new NotFoundException('File path does not exist');
    }

    const filePath = path.resolve(target.file_path);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('File does not exist');
    }

    await this.resourcesService.incrementDownload(id);

    res.set({
      'Content-Type': target.mime_type || 'application/octet-stream',
      'Content-Disposition': attachmentContentDisposition(target.file_name || 'file'),
    });

    return new StreamableFile(createReadStream(filePath));
  }

  @Get(':id/versions')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getVersions(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    // Resolve the resource first so version listings inherit its visibility rules.
    await this.resourcesService.getById(id, req?.user);
    return this.versionService.list(id, req?.user);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(resourceUploadInterceptor)
  @RateLimit({ max: 5, window: 60 })
  // `@Body()` with `FileInterceptor` opts this route out of the global ValidationPipe,
  // so we validate the body manually below to enforce whitelist + forbidNonWhitelisted.
  async create(
    @Body() rawBody: Record<string, any>,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    let storedFile: Awaited<ReturnType<ResourceStorageService['storeIncoming']>>;
    let rendererDraft;
    try {
      if (typeof rawBody.content_json === 'string') {
        try { rawBody = { ...rawBody, content_json: JSON.parse(rawBody.content_json) }; }
        catch { throw new BadRequestException('content_json 必须是合法 JSON'); }
      }
      const body = await new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }).transform(rawBody, { type: 'body', metatype: CreateResourceDto });
      const idempotencyKey = req.headers?.['idempotency-key'];
      const schematicCode = body.schematic_code?.trim();
      const previewDraftId = body.preview_draft_id?.trim();
      if (body.resource_type === 'external' && file) {
        throw new BadRequestException('外链资源不能同时上传本站托管文件');
      }
      if (schematicCode && (body.resource_kind !== 'schematic' || body.resource_type !== 'upload')) {
        throw new BadRequestException('粘贴蓝图代码仅可用于本站托管的蓝图资源');
      }
      if (file && schematicCode) {
        throw new BadRequestException('蓝图请在上传文件和粘贴代码中二选一');
      }
      if (previewDraftId && (file || schematicCode)) {
        throw new BadRequestException('已生成预览的资源不能再次上传文件或粘贴蓝图代码');
      }
      if (file) await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      if (previewDraftId) {
        rendererDraft = await this.resourcePreviewService.consumeDraft(userId, previewDraftId, body.resource_kind || '');
        storedFile = rendererDraft.file;
      } else storedFile = schematicCode
        ? await this.resourceStorageService.storePastedSchematic(schematicCode)
        : await this.resourceStorageService.storeIncoming(file);
      const resFile = storedFile ? await this.directUploads?.uploadManagedFile(storedFile) : undefined;
      if (storedFile && !resFile) throw new BadRequestException('资源存储服务暂不可用，请稍后重试');
      const resource = await this.resourcesService.create(body, userId, resFile, {
        ipAddress: getClientIp(req),
        rendererDraft,
        idempotencyKey,
        idempotencyPayload: body,
      });
      if (storedFile?.file_path) await this.resourceStorageService.removeManaged(storedFile.file_path).catch(() => undefined);
      await this.logOperation(req, 'resource.create', resource.id, { title: resource.title, resource_type: resource.resource_type });
      return resource;
    } catch (error) {
      await cleanupUploadedFile(file);
      if (storedFile?.file_path) await fs.unlink(storedFile.file_path).catch(() => undefined);
      if (rendererDraft) await this.resourcePreviewService.discardConsumedDraft(rendererDraft);
      throw error;
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateResourceDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    const resource = await this.resourcesService.update(id, userId, dto, req.user.role, {
      ipAddress: getClientIp(req),
    });
    await this.logOperation(req, 'resource.update', id, { fields: Object.keys(dto) });
    return resource;
  }

  @Post(':id/retry-preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async retryPreview(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const resource = await this.resourcesService.getForFileAccess(id, req.user);
    if (!this.resourcePreviewService.supports(resource)) {
      throw new BadRequestException('该资源类型不支持预览');
    }
    void this.resourcePreviewService.enqueue(resource);
    await this.logOperation(req, 'resource.preview_retry', id);
    return { status: 'processing' };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    await this.resourcesService.delete(id, userId, req.user.role);
    await this.logOperation(req, 'resource.delete', id);
    return { message: 'Resource deleted successfully' };
  }

  @Post(':id/versions')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(resourceUploadInterceptor)
  @RateLimit({ max: 5, window: 60 })
  async addVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { version?: string; content?: string },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    let storedFile: Awaited<ReturnType<ResourceStorageService['storeIncoming']>>;
    try {
      if (file) await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      storedFile = await this.resourceStorageService.storeIncoming(file);
      const resFile = storedFile ? await this.directUploads?.uploadManagedFile(storedFile) : undefined;
      if (storedFile && !resFile) throw new BadRequestException('资源存储服务暂不可用，请稍后重试');
      const version = await this.versionService.create(
        { resource_id: id, version: body.version || '', content: body.content },
        resFile,
        userId,
      );
      if (storedFile?.file_path) await this.resourceStorageService.removeManaged(storedFile.file_path).catch(() => undefined);
      await this.logOperation(req, 'resource.version_create', id, { version_id: version.id, version: version.version });
      return version;
    } catch (error) {
      await cleanupUploadedFile(file);
      if (storedFile?.file_path) await fs.unlink(storedFile.file_path).catch(() => undefined);
      throw error;
    }
  }

  @Delete(':id/versions/:versionId')
  @UseGuards(JwtAuthGuard)
  async deleteVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    await this.versionService.delete(versionId, id, userId);
    await this.logOperation(req, 'resource.version_delete', id, { version_id: versionId });
    return { message: 'Version deleted successfully' };
  }

  @Put(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
    @Body('reject_reason') rejectReason: string | undefined,
    @Req() req: any,
  ) {
    const resource = await this.resourcesService.updateStatus(id, status, {
      actorUsername: req.user?.username,
      actorUserId: Number(req.user?.id) || null,
      rejectReason,
    });
    await this.logOperation(req, 'resource.moderate', id, { status, reject_reason: rejectReason || null });
    return resource;
  }

  @Put(':id/featured')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async setFeatured(@Param('id', ParseIntPipe) id: number, @Body('featured') featured: unknown, @Req() req: any) {
    if (typeof featured !== 'boolean') throw new BadRequestException('featured 必须是布尔值');
    const result = await this.resourceOperations.setFeaturedById(id, featured, {
      userId: req.user?.id,
      requestId: req.requestId,
      ipAddress: getClientIp(req),
      userAgent: req.headers?.['user-agent'],
    });
    return result.resource;
  }

  @Delete(':id/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async adminDelete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.resourcesService.adminDelete(id);
    await this.logOperation(req, 'resource.admin_delete', id);
    return { message: 'Resource deleted successfully' };
  }

  @Post('admin/cleanup-storage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async cleanupStorage(@Req() req: any) {
    const result = await this.resourceLifecycleService.cleanup();
    await this.logOperation(req, 'resource.storage_cleanup', undefined, { ...result });
    return result;
  }

  @Post(':id/rating')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ max: 30, window: 60 })
  async upsertRating(
    @Param('id', ParseIntPipe) id: number,
    @Body('rating') rating: number,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    const result = await this.resourcesService.upsertRating(id, userId, rating);
    await this.logOperation(req, 'resource.rate', id, { rating });
    return result;
  }

  @Delete(':id/rating')
  @UseGuards(JwtAuthGuard)
  async deleteRating(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    await this.resourcesService.deleteRating(id, userId);
    await this.logOperation(req, 'resource.unrate', id);
    return { message: 'Rating deleted successfully' };
  }

  @Get(':id/rating')
  @UseGuards(JwtAuthGuard)
  async getUserRating(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    const rating = await this.resourcesService.getUserRating(id, userId);
    return { rating };
  }

  @Get(':id/favorite')
  @UseGuards(JwtAuthGuard)
  async getFavorite(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.favoritesService.getStatus(id, req.user.id);
  }

  @Post(':id/favorite')
  @UseGuards(JwtAuthGuard)
  async addFavorite(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const result = await this.favoritesService.add(id, req.user.id);
    await this.logOperation(req, 'resource.favorite', id);
    return result;
  }

  @Delete(':id/favorite')
  @UseGuards(JwtAuthGuard)
  async removeFavorite(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const result = await this.favoritesService.remove(id, req.user.id);
    await this.logOperation(req, 'resource.unfavorite', id);
    return result;
  }

  @Get(':id/like')
  @UseGuards(JwtAuthGuard)
  async getLike(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.likesService.getStatus(id, req.user.id);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  async addLike(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const result = await this.likesService.add(id, req.user.id);
    await this.logOperation(req, 'resource.like', id);
    return result;
  }

  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  async removeLike(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const result = await this.likesService.remove(id, req.user.id);
    await this.logOperation(req, 'resource.unlike', id);
    return result;
  }

  @Get(':id/subscription')
  @UseGuards(JwtAuthGuard)
  async getSubscription(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.resourcesService.getById(id, req.user);
    return this.subscriptionsService.getStatus(id, req.user.id);
  }

  @Post(':id/subscription')
  @UseGuards(JwtAuthGuard)
  async subscribe(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.resourcesService.getById(id, req.user);
    const result = await this.subscriptionsService.subscribe(id, req.user.id);
    await this.logOperation(req, 'resource.subscribe', id);
    return result;
  }

  @Delete(':id/subscription')
  @UseGuards(JwtAuthGuard)
  async unsubscribe(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.resourcesService.getById(id, req.user);
    const result = await this.subscriptionsService.unsubscribe(id, req.user.id);
    await this.logOperation(req, 'resource.unsubscribe', id);
    return result;
  }

  private async logOperation(req: any, action: string, resourceId?: number, details?: Record<string, unknown>): Promise<void> {
    await this.logsService.log({
      user_id: req.user?.id,
      action,
      target_type: 'resource',
      target_id: resourceId,
      details: details ? JSON.stringify(details) : undefined,
      ip_address: getClientIp(req),
      user_agent: req.headers?.['user-agent'],
    }).catch((error) => console.warn('operation log failed:', error.message));
  }
}
