import { IsString, IsOptional, IsNumber, IsIn, IsUrl, ValidateIf } from 'class-validator';

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['upload', 'external'])
  resource_type?: string;

  /**
   * `@IsString()` alone allowed `javascript:` here, and the download route 302s to
   * this value — turning an approved resource into an open redirect and a script
   * execution vector on the forum's own origin.
   *
   * An empty string is allowed so the link can be cleared.
   */
  @IsOptional()
  @ValidateIf((_o, value) => value !== '' && value !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  external_url?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @IsNumber()
  is_public?: number;
}
