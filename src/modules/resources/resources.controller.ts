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
import { ResourcesService, ResourceFileMeta } from './resources.service';
import { ResourceCategoryService } from './resource-categories.service';
import { ResourceVersionService } from './resource-versions.service';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { QueryResourcesDto } from './dto/query-resources.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { OptionalAuth } from '@common/decorators/public.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { assertSafeRedirectUrl } from '@common/utils/safe-url.util';
import * as fs from 'fs/promises';
import * as path from 'path';

const RESOURCE_UPLOAD_DIR = './uploads/resources';
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
      mkdirSync(RESOURCE_UPLOAD_DIR, { recursive: true });
      callback(null, RESOURCE_UPLOAD_DIR);
    },
    filename: (_req, file, callback) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      callback(null, `${uniqueSuffix}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_RESOURCE_SIZE },
  fileFilter: resourceFileFilter,
});

function toFileMeta(file?: Express.Multer.File): ResourceFileMeta | undefined {
  if (!file) return undefined;
  return {
    file_name: file.originalname,
    file_path: file.path,
    file_size: file.size,
    mime_type: file.mimetype,
  };
}

function normalizeCategoryBody(body: any) {
  return {
    name: body.name,
    slug: body.slug,
    description: body.description || null,
    icon: body.icon || null,
    sort_order: body.sort_order !== undefined ? Number(body.sort_order) : undefined,
    is_active: body.is_active === false || body.is_active === 'false' ? 0 : 1,
  };
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

  @Get(':id/download')
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
    const body = await new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }).transform(rawBody, { type: 'body', metatype: CreateResourceDto });
    const userId = req.user.id;
    const useMfl = body.use_mfl === '1' || body.use_mfl === 'true' || body.use_mfl === true;

    try {
      if (useMfl && file) {
        // MFL mode: read file buffer, upload to MFL, don't save locally
        const fileBuffer = await fs.readFile(file.path);
        const mflMeta = {
          file_name: file.originalname,
          file_size: file.size,
          mime_type: file.mimetype,
          file_buffer: fileBuffer,
        };
        await cleanupUploadedFile(file);
        return await this.resourcesService.create(body, userId, undefined, mflMeta);
      }
      return await this.resourcesService.create(body, userId, toFileMeta(file));
    } catch (error) {
      await cleanupUploadedFile(file);
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
    return this.resourcesService.update(id, userId, dto, req.user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    await this.resourcesService.delete(id, userId, req.user.role);
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
    try {
      return await this.versionService.create(
        { resource_id: id, version: body.version || '', content: body.content },
        toFileMeta(file),
        userId,
      );
    } catch (error) {
      await cleanupUploadedFile(file);
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
    return this.resourcesService.updateStatus(id, status, {
      actorUsername: req.user?.username,
      rejectReason,
    });
  }

  @Delete(':id/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async adminDelete(@Param('id', ParseIntPipe) id: number) {
    await this.resourcesService.adminDelete(id);
    return { message: 'Resource deleted successfully' };
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
    return this.resourcesService.upsertRating(id, userId, rating);
  }

  @Delete(':id/rating')
  @UseGuards(JwtAuthGuard)
  async deleteRating(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    await this.resourcesService.deleteRating(id, userId);
    return { message: 'Rating deleted successfully' };
  }

  @Get(':id/rating')
  @UseGuards(JwtAuthGuard)
  async getUserRating(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    const rating = await this.resourcesService.getUserRating(id, userId);
    return { rating };
  }
}
