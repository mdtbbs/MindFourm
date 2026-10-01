import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, IsIn, IsObject, IsInt, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TiptapDocumentDto } from '@common/dto/tiptap-document.dto';

export class CreatePostDto {
  @ApiProperty({ example: '示例帖子标题', description: '帖子标题。' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: '这里填写帖子正文。', description: '旧版 Markdown 正文投影；新客户端可提交 content_json。' })
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @ApiPropertyOptional({ maxLength: 16, example: 'zh-CN', description: '正文主要语言标识；省略时服务端保存为 unknown。' })
  content_language?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, example: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '这里填写帖子正文。' }] }] }, description: 'Rich Content Schema v2 正文来源；与 content_schema_version: 2 一起提交。content Markdown 是兼容投影。' })
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

  @ApiPropertyOptional({ example: 'normal', description: '帖子类型；省略时使用 normal。需要显示前缀时填站点当前配置的前缀标识。' })
  @IsOptional()
  @IsString()
  post_type?: string;

  @ApiPropertyOptional({ type: [String], example: ['建筑'], description: '帖子标签名称列表。' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /**
   * Constrained so a caller cannot ask for `pending` or `deleted` directly. A
   * request to publish still goes through `require_post_approval`.
   */
  @ApiPropertyOptional({ enum: ['draft', 'published'], example: 'published', description: '请求保存为草稿或发布。发布仍受审核和论坛策略控制。' })
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;
}
