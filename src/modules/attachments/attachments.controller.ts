import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFiles,
  Req,
  Res,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AttachmentsService } from './attachments.service';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { Public } from '@common/decorators/public.decorator';
import type { Request, Response } from 'express';

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
  'application/x-rar-compressed', 'application/x-7z-compressed',
  'application/gzip', 'application/x-tar',
];

const ALLOWED_EXTENSIONS_BY_MIME = new Map<string, Set<string>>([
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/gif', new Set(['.gif'])],
  ['image/webp', new Set(['.webp'])],
  ['application/pdf', new Set(['.pdf'])],
  ['application/msword', new Set(['.doc'])],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', new Set(['.docx'])],
  ['application/vnd.ms-excel', new Set(['.xls'])],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Set(['.xlsx'])],
  ['text/plain', new Set(['.txt'])],
  ['text/csv', new Set(['.csv'])],
  ['application/zip', new Set(['.zip'])],
  ['application/x-zip-compressed', new Set(['.zip'])],
  ['application/x-rar-compressed', new Set(['.rar'])],
  ['application/x-7z-compressed', new Set(['.7z'])],
  ['application/gzip', new Set(['.gz'])],
  ['application/x-tar', new Set(['.tar'])],
]);

function fileFilter(_req: any, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) {
  const ext = extname(file.originalname).toLowerCase();
  const allowedExtensions = ALLOWED_EXTENSIONS_BY_MIME.get(file.mimetype);
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype) || !allowedExtensions?.has(ext)) {
    callback(new Error('File type not allowed'), false);
    return;
  }

  callback(null, true);
}

@Controller('attachments')
export class AttachmentsController {
  private readonly logger = new Logger(AttachmentsController.name);

  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: diskStorage({
        destination: './uploads/attachments',
        filename: (_req, file, callback) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          callback(null, `${uniqueSuffix}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter,
    })
  )
  async upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: UploadAttachmentDto,
    @Req() req: Request,
  ) {
    // Multer leaves `files` undefined when nothing is sent; iterating threw a
    // TypeError and surfaced as a 500.
    if (!files?.length) {
      throw new BadRequestException('没有收到文件');
    }

    const userId = (req as any).user?.id;
    const role = (req as any).user?.role;
    const isStaff = role === 'admin' || role === 'moderator';

    if (body.post_id) {
      await this.attachmentsService.assertCanAttachToPost(body.post_id, userId, isStaff);
    }

    const results: any[] = [];
    for (const file of files) {
      const attachment = await this.attachmentsService.create({
        post_id: body.post_id,
        reply_id: body.reply_id,
        user_id: userId,
        file_name: file.originalname,
        file_path: file.path,
        file_size: file.size,
        mime_type: file.mimetype,
      });
      results.push(attachment);
    }
    return { message: 'Files uploaded successfully', attachments: results };
  }

  @Get('post/:postId')
  @Public()
  async getByPost(@Param('postId', ParseIntPipe) postId: number) {
    return this.attachmentsService.getByPostId(postId);
  }

  @Get(':id/download')
  @Public()
  async download(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const attachment = await this.attachmentsService.getForDownload(id);

    const filePath = path.resolve(attachment.file_path);
    // Confirm the file is readable before committing to a 200 with download headers.
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('File does not exist');
    }

    await this.attachmentsService.incrementDownloadCount(id);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.file_name)}"`);
    // nosniff (set by helmet) stops the browser from re-interpreting this.
    res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');

    const stream = createReadStream(filePath);
    // Without this listener a mid-stream read failure emits an unhandled 'error'
    // event, which in Node is an uncaught exception — i.e. a remote crash.
    stream.on('error', (error) => {
      this.logger.error(`Failed to stream attachment ${id}: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to read file' });
      } else {
        res.destroy(error);
      }
    });
    stream.pipe(res);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  // Any authenticated user may reach this; the service enforces "owner or staff".
  // Restricting the route to @Roles('admin','moderator') made the owner branch in
  // AttachmentsService.delete unreachable, so users could not remove their own files.
  async delete(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const userId = (req as any).user?.id;
    const role = (req as any).user?.role;
    const isAdmin = role === 'admin' || role === 'moderator';
    await this.attachmentsService.delete(id, userId, isAdmin);
    return { message: 'Attachment deleted successfully' };
  }
}
