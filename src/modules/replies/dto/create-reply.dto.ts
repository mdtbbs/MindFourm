import { IsString, IsOptional, IsNumber, IsObject, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TiptapDocumentDto } from '@common/dto/tiptap-document.dto';

export class CreateReplyDto {
  @ApiPropertyOptional({ example: '这里填写回复内容。', description: '旧版 Markdown 正文投影；新客户端可提交 content_json。' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, example: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '这里填写回复内容。' }] }] }, description: 'Rich Content Schema v2 正文来源；与 content_schema_version: 2 一起提交。' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2], example: 2, description: '富文本 Schema 版本。旧客户端省略此字段。' })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, example: 123, description: '父回复 ID；用于回复某条回复，不传表示直接回复主题。' })
  @IsOptional()
  @IsNumber()
  parent_reply_id?: number;
}
