import { IsString, IsOptional, IsNumber, IsIn, IsUrl, ValidateIf, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { TiptapDocumentDto } from '../../../common/dto/tiptap-document.dto';
import { RESOURCE_KIND_VALUES } from '../resource-kind-registry';

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

  @IsOptional()
  @IsIn(RESOURCE_KIND_VALUES)
  resource_kind?: string;

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
  @MaxLength(16)
  content_language?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TiptapDocumentDto)
  content_json?: TiptapDocumentDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  is_public?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
