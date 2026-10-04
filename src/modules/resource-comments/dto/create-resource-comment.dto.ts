import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsNumber, IsObject, IsInt, Min, Max } from 'class-validator';
import { TiptapDocumentDto } from '@common/dto/tiptap-document.dto';

export class CreateResourceCommentDto {
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Rich Content Schema v2；资源评论接口只作为 canonical Reply 的兼容投影。' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2], example: 2 })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, description: 'canonical Forum Thread 中的父回复 ID。' })
  @IsOptional()
  @IsNumber()
  parent_comment_id?: number;
}
