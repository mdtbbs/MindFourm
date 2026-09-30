import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, IsIn, IsObject, IsInt, Min, Max, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TiptapDocumentDto } from '@common/dto/tiptap-document.dto';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Legacy Markdown projection. May be omitted when content_json is supplied.' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'User-selected language tag for this post; use unknown when unavailable.' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  content_language?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Canonical Rich Content Schema v2 source; submit with content_schema_version: 2. Markdown content is a legacy projection.' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2], description: 'Rich Content Schema version. Omit only for legacy clients.' })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;

  @IsOptional()
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @IsNumber()
  server_id?: number;

  @IsOptional()
  @IsNumber()
  required_group_id?: number;

  @IsOptional()
  @IsString()
  post_type?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /**
   * Constrained so a caller cannot ask for `pending` or `deleted` directly. A
   * request to publish still goes through `require_post_approval`.
   */
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;
}
