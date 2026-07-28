import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import { extname } from 'path';
import { diskStorage } from 'multer';

export const PUBLIC_IMAGE_UPLOAD_DIR = './uploads/public-images';
export const PUBLIC_IMAGE_SERVE_ROOT = '/uploads/public-images';
export const MAX_PUBLIC_IMAGE_SIZE = 2 * 1024 * 1024;

const ALLOWED_IMAGE_EXTENSIONS_BY_MIME = new Map<string, Set<string>>([
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/gif', new Set(['.gif'])],
  ['image/webp', new Set(['.webp'])],
]);

function publicImageFileFilter(
  _req: any,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  const allowedExtensions = ALLOWED_IMAGE_EXTENSIONS_BY_MIME.get(file.mimetype);

  if (!allowedExtensions?.has(ext)) {
    callback(new BadRequestException('仅支持 JPEG、PNG、GIF、WebP 图片'), false);
    return;
  }

  callback(null, true);
}

export const publicImageUploadInterceptor = FileInterceptor('image', {
  storage: diskStorage({
    destination: (_req, _file, callback) => {
      mkdirSync(PUBLIC_IMAGE_UPLOAD_DIR, { recursive: true });
      callback(null, PUBLIC_IMAGE_UPLOAD_DIR);
    },
    filename: (_req, file, callback) => {
      callback(null, `${Date.now()}-${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_PUBLIC_IMAGE_SIZE },
  fileFilter: publicImageFileFilter,
});

export async function cleanupUploadedPublicImage(file?: Express.Multer.File): Promise<void> {
  if (!file?.path) return;
  await fs.unlink(file.path).catch(() => undefined);
}
