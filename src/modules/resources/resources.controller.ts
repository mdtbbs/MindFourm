import {
  Controller,
  Get,
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
  BadRequestException,
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
import { UpdateResourceDto } from './dto/update-resource.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { QueryResourcesDto } from './dto/query-resources.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { OptionalAuth } from '@common/decorators/public.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { RawHttpResponse } from '@common/decorators/api-v1.decorator';
import { assertSafeRedirectUrl } from '@common/utils/safe-url.util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourceStorageService } from './resource-storage.service';
import { LogsService } from '../logs/logs.service';
import { getClientIp } from '@common/utils/client-context.util';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { ResourceLifecycleService } from './resource-lifecycle.service';
import { ResourceSubscriptionsService } from './resource-subscriptions.service';

const RESOURCE_INCOMING_DIR = './uploads/.incoming/resources';
const MAX_RESOURCE_SIZE = 50 * 1024 * 1024;
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

const resourceUploadInterceptor = FileInterceptor('file', {
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
  limits: { fileSize: MAX_RESOURCE_SIZE },
  fileFilter: resourceFileFilter,
});

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

async function cleanupUploadedFile(file?: Express.Multer.File): Promise<void> {
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
    private readonly resourceStorageService: ResourceStorageService,
    private readonly logsService: LogsService,
    private readonly resourceLifecycleService: ResourceLifecycleService,
    private readonly subscriptionsService: ResourceSubscriptionsService,
  ) {}

  @Get()
  async getList(@Query() query: QueryResourcesDto) {
    return this.resourcesService.getList(query, { scope: 'public' });
  }

  @Get('hot')
  async getHotResources() {
    return this.resourcesService.getHotResources();
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
  async createCategory(@Body() body: any) {
    return this.categoryService.create(normalizeCategoryBody(body));
  }

  @Put('categories/:categoryId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateCategory(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() body: any,
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

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMyResources(@Query() query: QueryResourcesDto, @Req() req: any) {
    return this.resourcesService.getByUserId(req.user.id, query.limit, query.cursor);
  }

  @Get(':id')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getById(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.resourcesService.getByIdWithVersions(id, req?.user);
  }

  @Get(':id/related')
  async getRelated(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    return this.resourcesService.getRelatedResources(id, Number(limit) || 6);
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
    // getById enforces moderation status, so unapproved files are not downloadable.
    const resource = await this.resourcesService.getById(id, req?.user);

    // MFL redirect: if resource uses MFL, redirect to MFL download URL
    if (!versionId && resource.use_mfl && resource.mfl_download_url) {
      assertSafeRedirectUrl(resource.mfl_download_url);
      await this.resourcesService.incrementDownload(id);
      return res.redirect(resource.mfl_download_url);
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
      ? await this.versionService.getDownloadTarget(id, Number(versionId))
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
      'Content-Disposition': `attachment; filename="${encodeURIComponent(target.file_name || 'file')}"`,
    });

    return new StreamableFile(createReadStream(filePath));
  }

  @Get(':id/versions')
  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  async getVersions(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    // Resolve the resource first so version listings inherit its visibility rules.
    await this.resourcesService.getById(id, req?.user);
    return this.versionService.list(id);
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
    try {
      const body = await new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }).transform(rawBody, { type: 'body', metatype: CreateResourceDto });
      if (file) await assertSafeUploadedFile(file, MAX_RESOURCE_SIZE);
      storedFile = await this.resourceStorageService.storeIncoming(file);
      const resource = await this.resourcesService.create(body, userId, storedFile, {
        ipAddress: getClientIp(req),
      });
      await this.logOperation(req, 'resource.create', resource.id, { title: resource.title, resource_type: resource.resource_type });
      return resource;
    } catch (error) {
      await cleanupUploadedFile(file);
      if (storedFile?.file_path) await fs.unlink(storedFile.file_path).catch(() => undefined);
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
      const version = await this.versionService.create(
        { resource_id: id, version: body.version || '', content: body.content },
        storedFile,
        userId,
      );
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
      rejectReason,
    });
    await this.logOperation(req, 'resource.moderate', id, { status, reject_reason: rejectReason || null });
    return resource;
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
