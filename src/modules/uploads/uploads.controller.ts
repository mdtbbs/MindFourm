import {
  BadRequestException,
  Body,
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
import { RemoteImageImportService } from './remote-image-import.service';
import { ImportImageDto } from './dto/import-image.dto';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';

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
  constructor(private readonly uploadsService: UploadsService, private readonly remoteImages: RemoteImageImportService) {}

  @Post('images/import')
  @UseGuards(RolesGuard)
  @Roles('moderator')
  @RateLimit({ max: 120, window: 300 })
  async importInlineImage(@Body() dto: ImportImageDto) {
    return this.remoteImages.importImage(dto.url);
  }

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
