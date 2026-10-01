import { IsString, IsOptional, IsObject, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TiptapDocumentDto } from '@common/dto/tiptap-document.dto';

export class UpdateReplyDto {
  @ApiPropertyOptional({ example: '修改后的回复内容。', description: '旧版 Markdown 正文投影；新客户端可改用 content_json。' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, example: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '修改后的回复内容。' }] }] }, description: 'Rich Content Schema v2 正文来源；与 content_schema_version: 2 一起提交。' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2], example: 2, description: '富文本 Schema 版本。旧客户端省略此字段。' })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;
}
