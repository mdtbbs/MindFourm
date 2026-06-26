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
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { createReadStream } from 'fs';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
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
    @Body() body: { post_id?: number; reply_id?: number },
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.id;
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
    const attachment = await this.attachmentsService.getById(id);
    await this.attachmentsService.incrementDownloadCount(id);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.file_name)}"`);
    res.setHeader('Content-Type', attachment.mime_type);
    createReadStream(attachment.file_path).pipe(res);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'moderator')
  async delete(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const userId = (req as any).user?.id;
    const role = (req as any).user?.role;
    const isAdmin = role === 'admin' || role === 'moderator';
    await this.attachmentsService.delete(id, userId, isAdmin);
    return { message: 'Attachment deleted successfully' };
  }
}
