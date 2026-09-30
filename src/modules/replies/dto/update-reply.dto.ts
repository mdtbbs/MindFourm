import { IsString, IsOptional, IsObject, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TiptapDocumentDto } from '@common/dto/tiptap-document.dto';

export class UpdateReplyDto {
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Canonical Rich Content Schema v2 source; submit with content_schema_version: 2. Markdown content is a legacy projection.' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2], description: 'Rich Content Schema version. Omit only for legacy clients.' })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;
}
