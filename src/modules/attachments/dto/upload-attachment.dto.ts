import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Files themselves are handled by multer; this covers the multipart text fields.
 *
 * These were previously typed inline in the controller, which opted the route out
 * of the global ValidationPipe's `whitelist`/`forbidNonWhitelisted` checks.
 */
export class UploadAttachmentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  post_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  reply_id?: number;
}
