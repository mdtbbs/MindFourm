import {
  IsString, IsNotEmpty, IsOptional, IsNumber, IsIn, IsUrl, ValidateIf, IsArray, ValidateNested, IsObject, IsInt, Min, Max, MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TiptapDocumentDto } from '../../../common/dto/tiptap-document.dto';
import { RESOURCE_KIND_VALUES } from '../resource-kind-registry';

export class CreateResourceCompatibilityDto {
  @IsOptional()
  @IsString()
  min_version_value?: string;

  @IsOptional()
  @IsString()
  max_version_value?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateResourceDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['upload', 'external'])
  resource_type: string;

  /** Classification is intentionally distinct from upload/external delivery. */
  @IsOptional()
  @IsIn(RESOURCE_KIND_VALUES)
  resource_kind?: string;

  /**
   * Mindustry's clipboard export is the base64 representation of an .msch
   * payload.  It is accepted only for schematic resources and becomes a
   * forum-managed .msch file before the resource row is created.
   */
  @IsOptional()
  @IsString()
  @MaxLength(28 * 1024 * 1024)
  schematic_code?: string;

  /** A private, user-bound preview draft that has already been parsed. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  preview_draft_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  duplicate_note?: string;

  /** Must be a real http(s) URL — see UpdateResourceDto for why. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== '' && value !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  external_url?: string;

  @IsString()
  @IsNotEmpty()
  version: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  content_language?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Rich Content Schema v2 source; Markdown is a compatibility projection.' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2] })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;

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

  /** Canonical upstream source for this resource, distinct from a download URL. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== '' && value !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  source_url?: string;

  @IsOptional()
  @IsString()
  license?: string;

  /** The submitting account is recorded separately from these credits. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  original_authors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  maintainers?: string[];

  /** Mindustry compatibility belongs to a release, never to release.version. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateResourceCompatibilityDto)
  compatibility?: CreateResourceCompatibilityDto[];
}
