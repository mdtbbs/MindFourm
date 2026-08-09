import { IsString, IsOptional, IsUrl, ValidateIf } from 'class-validator';

/**
 * Validation DTO for the six brand fields exposed via the public settings
 * endpoint and editable in the admin "basic" category.
 *
 * URL fields accept empty strings so the admin can clear them, but non-empty
 * values must be valid http(s) URLs to prevent open-redirect and script-execution
 * vectors (see UpdateResourceDto.external_url for the same pattern).
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
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  site_logo_url?: string;

  @IsOptional()
  @ValidateIf((_o, value) => value !== '' && value !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  site_favicon_url?: string;

  @IsOptional()
  @IsString()
  sidebar_title?: string;
}
