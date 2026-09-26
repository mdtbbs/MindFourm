import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, IsIn, IsObject } from 'class-validator';
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

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Tiptap / ProseMirror JSON source. The server validates against its allowlisted schema.' })
  @IsOptional()
  @IsObject()
  content_json?: TiptapDocumentDto;

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
