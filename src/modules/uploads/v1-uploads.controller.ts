import { BadRequestException, Controller, HttpStatus, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { cleanupUploadedPublicImage, MAX_PUBLIC_IMAGE_SIZE, publicImageUploadInterceptor } from './public-image-upload';
import { UploadsService } from './uploads.service';
import { OAuthScopeGuard } from '../../common/guards/oauth-scope.guard';
import { RequireOAuthScopes } from '../../common/decorators/require-oauth-scopes.decorator';
import { SettingsService } from '../settings/settings.service';
import { ApiV1Exception } from '../../common/exceptions/api-v1.exception';

@ApiV1()
@ApiTags('v1-uploads')
@Controller('v1/uploads')
@UseGuards(JwtAuthGuard, OAuthScopeGuard)
export class UploadsV1Controller {
  constructor(private readonly uploads: UploadsService, private readonly settings: SettingsService) {}
  @Post('images')
  @RequireOAuthScopes('forum.write')
  @UseInterceptors(publicImageUploadInterceptor)
  async image(@UploadedFile() file?: Express.Multer.File) {
    if (!await this.settings.getBoolean('feature_public_api_image_upload_enabled', true)) {
      await cleanupUploadedPublicImage(file);
      throw new ApiV1Exception('FEATURE_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭图片上传', false);
    }
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
