import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import {
  cleanupUploadedPublicImage,
  MAX_PUBLIC_IMAGE_SIZE,
  publicImageUploadInterceptor,
} from './public-image-upload';
import { UploadsService } from './uploads.service';

/**
 * Public URLs are required while a user is composing a post, reply, resource or
 * notice: none of those records necessarily exists when an image is picked.
 *
 * This intentionally does not reuse `attachments/upload`, whose files must be
 * attached to an existing post or reply and remain quarantined for moderation.
 */
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('images')
  @UseInterceptors(publicImageUploadInterceptor)
  async uploadInlineImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('没有收到图片');
    }

    try {
      await assertSafeUploadedFile(file, MAX_PUBLIC_IMAGE_SIZE);
      return this.uploadsService.toPublicImageResult(file);
    } catch (error) {
      await cleanupUploadedPublicImage(file);
      throw error;
    }
  }
}
