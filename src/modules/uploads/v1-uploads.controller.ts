import { BadRequestException, Controller, HttpStatus, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OAuthProtected } from '@common/decorators/oauth-protected.decorator';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { cleanupUploadedPublicImage, MAX_PUBLIC_IMAGE_SIZE, publicImageUploadInterceptor } from './public-image-upload';
import { UploadsService } from './uploads.service';
import { SettingsService } from '../settings/settings.service';
import { ApiV1Exception } from '../../common/exceptions/api-v1.exception';

@ApiV1()
@ApiTags('v1-uploads')
@Controller('v1/uploads')
export class UploadsV1Controller {
  constructor(private readonly uploads: UploadsService, private readonly settings: SettingsService) {}
  @Post('images')
  @OAuthProtected('forum.write')
  @UseInterceptors(publicImageUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'JPEG、PNG、GIF 或 WebP 图片，最大 2 MiB。' } } } })
  @ApiCreatedResponse({ description: '返回可嵌入帖子或资源正文的公开图片地址。', schema: { type: 'object', required: ['url', 'filename', 'original_name', 'mime_type', 'size'], properties: {
    url: { type: 'string', example: '/uploads/public-images/image-uuid.png', description: '论坛同源公开图片路径。' },
    filename: { type: 'string', description: '服务端生成的文件名。' },
    original_name: { type: 'string', description: '上传时的原始文件名。' },
    mime_type: { type: 'string', example: 'image/png', description: '检测到的图片 MIME 类型。' },
    size: { type: 'integer', description: '图片字节数。' },
  } } })
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
