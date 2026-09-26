import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TiptapDocumentDto } from '../../../common/dto/tiptap-document.dto';

export class UpdateResourceUploadDraftDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(50) version?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MaxLength(500_000) content?: string;
  @IsOptional() @ValidateNested() @Type(() => TiptapDocumentDto) content_json?: TiptapDocumentDto;
  @IsOptional() @Type(() => Number) @IsNumber() category_id?: number;
  @IsOptional() @IsBoolean() is_public?: boolean;
}
