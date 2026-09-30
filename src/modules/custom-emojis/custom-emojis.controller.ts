import {
  BadRequestException, Body, Controller, Delete, Get, Logger, NotFoundException,
  Param, ParseIntPipe, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createReadStream } from 'fs';
import { mkdir, rm } from 'fs/promises';
import * as path from 'path';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { Public } from '@common/decorators/public.decorator';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { CustomEmoji } from '@entities/custom-emoji.entity';
import { CustomEmojisService } from './custom-emojis.service';

const ROOT = path.resolve('./uploads/custom-emojis');
const EXTENSIONS: Record<string, string> = { 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
const logger = new Logger('CustomEmojisController');

@Controller('custom-emojis')
export class CustomEmojisController {
  constructor(private readonly emojis: CustomEmojisService) {}

  @Get()
  @Public()
  async list() {
    return (await this.emojis.listEnabled()).map((emoji) => ({ ...emoji, image_url: '/api/custom-emojis/' + emoji.id + '/image' }));
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  listAdmin() { return this.emojis.listAll(); }

  @Get(':id/image')
  @Public()
  async image(@Param('id', ParseIntPipe) id: number, @Res() response: Response) {
    const emoji = await this.emojis.getEnabled(id);
    const filePath = path.resolve(emoji.file_path);
    if (!filePath.startsWith(ROOT + path.sep)) throw new NotFoundException();
    response.setHeader('Content-Type', emoji.mime_type);
    response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    createReadStream(filePath).on('error', () => {
      if (!response.headersSent) response.status(404).end();
    }).pipe(response);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, callback) => {
        void mkdir(ROOT, { recursive: true }).then(() => callback(null, ROOT), (error) => callback(error, ROOT));
      },
      filename: (_req, file, callback) => callback(null, Date.now() + '-' + Math.random().toString(36).slice(2) + (EXTENSIONS[file.mimetype] || '')),
    }),
    limits: { fileSize: 1024 * 1024 },
    fileFilter: (_req, file, callback) => callback(
      EXTENSIONS[file.mimetype] && path.extname(file.originalname).toLowerCase() === EXTENSIONS[file.mimetype] ? null : new Error('Unsupported emoji image'),
      Boolean(EXTENSIONS[file.mimetype] && path.extname(file.originalname).toLowerCase() === EXTENSIONS[file.mimetype]),
    ),
  }))
  async create(@UploadedFile() file: Express.Multer.File, @Body() body: { name?: string; shortcode?: string }, @Req() request: Request): Promise<CustomEmoji> {
    if (!file) throw new BadRequestException('请选择 PNG、GIF 或 WebP 表情图片');
    try {
      await assertSafeUploadedFile(file, 1024 * 1024);
      return await this.emojis.create({
        name: String(body.name || ''),
        shortcode: String(body.shortcode || ''),
        file_name: file.originalname.slice(0, 255),
        file_path: file.path,
        mime_type: file.mimetype,
        created_by_user_id: Number((request as any).user?.id),
      });
    } catch (error) {
      await rm(file.path, { force: true });
      throw error;
    }
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: { name?: string; shortcode?: string; is_enabled?: boolean; sort_order?: number }) {
    return this.emojis.update(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const emoji = await this.emojis.remove(id);
    if (path.resolve(emoji.file_path).startsWith(ROOT + path.sep)) {
      await rm(emoji.file_path, { force: true }).catch((error) => logger.warn('Emoji file cleanup failed: ' + String(error)));
    }
    return { deleted: true };
  }
}
