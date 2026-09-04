import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { cleanupUploadedPublicImage, MAX_PUBLIC_IMAGE_SIZE, publicImageUploadInterceptor } from './public-image-upload';
import { UploadsService } from './uploads.service';

@ApiV1()
@ApiTags('v1-uploads')
@Controller('v1/uploads')
@UseGuards(JwtAuthGuard)
export class UploadsV1Controller {
  constructor(private readonly uploads: UploadsService) {}
  @Post('images')
  @UseInterceptors(publicImageUploadInterceptor)
  async image(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('没有收到图片');
    try {
      await assertSafeUploadedFile(file, MAX_PUBLIC_IMAGE_SIZE);
      return this.uploads.toPublicImageResult(file);
    } catch (error) {
      await cleanupUploadedPublicImage(file);
      throw error;
    }
  }
}
