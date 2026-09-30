import { IsBoolean, IsNumber, IsOptional, IsString, IsObject, IsInt, Min, Max, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TiptapDocumentDto } from '../../../common/dto/tiptap-document.dto';

export class UpdateResourceUploadDraftDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(50) version?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MaxLength(500_000) content?: string;
  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Rich Content Schema v2 source.' })
  @IsOptional() @IsObject() content_json?: Record<string, unknown>;
  @ApiPropertyOptional({ enum: [2] })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2) content_schema_version?: number;
  @IsOptional() @Type(() => Number) @IsNumber() category_id?: number;
  @IsOptional() @IsBoolean() is_public?: boolean;
}
