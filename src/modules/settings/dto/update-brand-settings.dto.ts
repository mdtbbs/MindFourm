import { IsString, IsOptional, Matches, ValidateIf } from 'class-validator';

/**
 * Validation DTO for the six brand fields exposed via the public settings
 * endpoint and editable in the admin "basic" category.
 *
 * URL fields accept empty strings so the admin can clear them. Non-empty values
 * must be either absolute http(s) URLs or server-relative paths starting with
 * `/` (the upload endpoint returns paths like `/uploads/public-images/xxx.png`).
 * This prevents open-redirect and script-execution vectors while keeping the
 * save-after-upload flow working.
 */
export class UpdateBrandSettingsDto {
  @IsOptional()
  @IsString()
  site_name?: string;

  @IsOptional()
  @IsString()
  site_tagline?: string;

  @IsOptional()
  @IsString()
  site_description?: string;

  @IsOptional()
  @ValidateIf((_o, value) => value !== '' && value !== null)
  @Matches(/^(\/|(https?:\/\/))/, { message: '必须是 http(s) URL 或以 / 开头的相对路径' })
  site_logo_url?: string;

  @IsOptional()
  @ValidateIf((_o, value) => value !== '' && value !== null)
  @Matches(/^(\/|(https?:\/\/))/, { message: '必须是 http(s) URL 或以 / 开头的相对路径' })
  site_favicon_url?: string;

  @IsOptional()
  @IsString()
  sidebar_title?: string;
}
