import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TiptapDocumentDto } from '@common/dto/tiptap-document.dto';

export class UpdateReplyDto {
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Tiptap / ProseMirror JSON source; takes precedence over content when supplied.' })
  @IsOptional()
  @IsObject()
  content_json?: TiptapDocumentDto;
}
