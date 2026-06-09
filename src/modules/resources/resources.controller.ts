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
  ParseIntPipe,
  HttpStatus,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ResourcesService } from './resources.service';
import { ResourceCategoryService } from './resource-categories.service';
import { ResourceVersionService } from './resource-versions.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { QueryResourcesDto } from './dto/query-resources.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import * as fs from 'fs/promises';
import * as path from 'path';

@Controller('resources')
export class ResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly categoryService: ResourceCategoryService,
    private readonly versionService: ResourceVersionService,
  ) {}

  /**
   * GET /api/resources - List approved resources (cursor pagination)
   */
  @Get()
  async getList(@Query() query: QueryResourcesDto) {
    return this.resourcesService.getList(query);
  }

  /**
   * GET /api/resources/categories - List categories
   */
  @Get('categories')
  async listCategories() {
    return this.categoryService.list();
  }

  /**
   * GET /api/resources/admin - List all statuses (auth, admin/mod)
   */
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async getAdminList(@Query() query: QueryResourcesDto) {
    return this.resourcesService.getList(query);
  }

  /**
   * GET /api/resources/:id - Detail with versions
   */
  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.resourcesService.getByIdWithVersions(id);
  }

  /**
   * GET /api/resources/:id/download - Download file
   */
  @Get(':id/download')
  async download(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resource = await this.resourcesService.getById(id);

    // Increment download count
    await this.resourcesService.incrementDownload(id);

    if (resource.resource_type === 'external' && resource.external_url) {
      // Redirect to external URL
      return res.redirect(resource.external_url);
    }

    if (!resource.file_path) {
      throw new Error('文件路径不存在');
    }

    const filePath = path.resolve(resource.file_path);

    // Check file exists
    try {
      await fs.access(filePath);
    } catch {
      throw new Error('文件不存在');
    }

    // Set headers
    res.set({
      'Content-Type': resource.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(resource.file_name || 'file')}"`,
    });

    const file = await fs.readFile(filePath);
    return new StreamableFile(file);
  }

  /**
   * GET /api/resources/:id/versions - List versions
   */
  @Get(':id/versions')
  async getVersions(@Param('id', ParseIntPipe) id: number) {
    return this.versionService.list(id);
  }

  /**
   * POST /api/resources - Upload/create (auth)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateResourceDto, @Req() req: any) {
    const userId = req.user.id;
    return this.resourcesService.create(dto, userId);
  }

  /**
   * PUT /api/resources/:id - Update (auth, owner)
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateResourceDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.resourcesService.update(id, userId, dto);
  }

  /**
   * DELETE /api/resources/:id - Delete (auth, owner)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    await this.resourcesService.delete(id, userId);
    return { success: true, message: '资源删除成功' };
  }

  /**
   * POST /api/resources/:id/versions - Add version (auth, owner)
   */
  @Post(':id/versions')
  @UseGuards(JwtAuthGuard)
  async addVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { version: string; file_path: string },
    @Req() req: any,
  ) {
    const userId = req.user.id;

    // Verify ownership
    const resource = await this.resourcesService.getById(id);
    if (resource.user_id !== userId) {
      throw new Error('无权限添加版本');
    }

    return this.versionService.create({
      resource_id: id,
      version: dto.version,
      file_path: dto.file_path,
    });
  }

  /**
   * PUT /api/resources/:id/status - Update status (auth, admin/mod)
   */
  @Put(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return this.resourcesService.updateStatus(id, status);
  }

  /**
   * DELETE /api/resources/:id/admin - Admin delete (auth, admin/mod)
   */
  @Delete(':id/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async adminDelete(@Param('id', ParseIntPipe) id: number) {
    await this.resourcesService.adminDelete(id);
    return { success: true, message: '资源删除成功' };
  }
}
