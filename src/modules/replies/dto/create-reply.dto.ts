import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TiptapDocumentDto } from '@common/dto/tiptap-document.dto';

export class CreateReplyDto {
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Tiptap / ProseMirror JSON source. The server validates against its allowlisted schema.' })
  @IsOptional()
  @IsObject()
  content_json?: TiptapDocumentDto;

  @IsOptional()
  @IsNumber()
  parent_reply_id?: number;
}
