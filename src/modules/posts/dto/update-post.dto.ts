import { IsString, IsOptional, IsNumber, IsArray, IsIn, IsObject, IsInt, Min, Max, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TiptapDocumentDto } from '@common/dto/tiptap-document.dto';

export class UpdatePostDto {
  @ApiPropertyOptional({ example: '修改后的帖子标题', description: '帖子标题。' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: '修改后的正文。', description: '旧版 Markdown 正文投影；新客户端可改用 content_json。' })
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @ApiPropertyOptional({ maxLength: 16, example: 'zh-CN', description: '正文主要语言标识；省略时不修改。' })
  content_language?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, example: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '修改后的正文。' }] }] }, description: 'Rich Content Schema v2 正文来源；与 content_schema_version: 2 一起提交。' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2], example: 2, description: '富文本 Schema 版本。旧客户端省略此字段。' })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, example: 1, description: '论坛分类 ID。' })
  @IsOptional()
  @IsNumber()
  category_id?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, example: 1, description: '关联的游戏服务器 ID。' })
  @IsOptional()
  @IsNumber()
  server_id?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, example: 1, description: '仅对该用户组开放时使用的用户组 ID。' })
  @IsOptional()
  @IsNumber()
  required_group_id?: number;

  @ApiPropertyOptional({ example: 'normal', description: '帖子类型；需要显示前缀时填站点当前配置的前缀标识。' })
  @IsOptional()
  @IsString()
  post_type?: string;

  @ApiPropertyOptional({ type: [String], example: ['建筑'], description: '帖子标签名称列表。' })
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
  @ApiPropertyOptional({ enum: ['draft', 'published'], example: 'published', description: '请求保存为草稿或发布；发布仍经过论坛审核策略。' })
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;

  // `is_pinned` is deliberately absent: it was writable here by any author, which
  // bypassed the @Roles('admin','moderator') `PUT /api/posts/:id/pin` endpoint.
  // The global ValidationPipe runs with forbidNonWhitelisted, so sending it now 400s.
}
