import { IsString, IsOptional, IsNumber, IsArray, IsIn, IsObject, IsInt, Min, Max, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TiptapDocumentDto } from '@common/dto/tiptap-document.dto';

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

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
   * Only `draft` and `published` may be requested, and an author asking to publish
   * still passes through the `require_post_approval` gate — see
   * `PostsService.resolveStatusTransition`.
   *
   * This used to be a free-form `@IsString()` applied after nothing more than an
   * ownership check, so `PUT /api/posts/:id {"status":"published"}` skipped the
   * moderation queue outright.
   */
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;

  // `is_pinned` is deliberately absent: it was writable here by any author, which
  // bypassed the @Roles('admin','moderator') `PUT /api/posts/:id/pin` endpoint.
  // The global ValidationPipe runs with forbidNonWhitelisted, so sending it now 400s.
}
