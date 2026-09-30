import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TiptapDocumentDto } from '@common/dto/tiptap-document.dto';
import { ServiceAccountSelectorDto } from './service-account-selector.dto';

export class CreateExternalApiKeyDto {
  @IsString()
  name: string;

  @IsArray()
  @IsString({ each: true })
  scopes: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_ips?: string[];

  @IsOptional()
  @IsNumber()
  default_user_id?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  rate_limit_per_minute?: number;

  @IsOptional()
  @IsDateString()
  expires_at?: string;
}

export class UpdateExternalApiKeyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_ips?: string[];

  @IsOptional()
  @IsNumber()
  default_user_id?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  rate_limit_per_minute?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsDateString()
  expires_at?: string | null;
}

export class QueryExternalApiKeysDto {
  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class QueryExternalApiAuditDto {
  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  api_key_id?: number;

  @IsOptional()
  @IsNumber()
  actor_user_id?: number;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ExternalCreatePostDto extends ServiceAccountSelectorDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Canonical Rich Content Schema v2 document. Submit with content_schema_version: 2; Markdown content is a legacy projection.' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2] })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;

  @IsOptional()
  @IsNumber()
  category_id?: number;

  /**
   * Integration provenance. This endpoint is API-key guarded; browser-originated
   * post creation never accepts this field.
   */
  @IsOptional()
  @IsString()
  @IsIn(['SYSTEM', 'GITHUB_ISSUE', 'GITHUB_PR'])
  source?: 'SYSTEM' | 'GITHUB_ISSUE' | 'GITHUB_PR';

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

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'published'])
  status?: string;
}

export class ExternalUpdatePostDto extends ServiceAccountSelectorDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Canonical Rich Content Schema v2 document. Submit with content_schema_version: 2; Markdown content is a legacy projection.' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2] })
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

  @IsOptional()
  @IsString()
  status?: string;
}

export class ExternalCreateReplyDto extends ServiceAccountSelectorDto {
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Canonical Rich Content Schema v2 document. Submit with content_schema_version: 2; Markdown content is a legacy projection.' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2] })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;

  @IsOptional()
  @IsNumber()
  parent_reply_id?: number;
}

export class ExternalUpdateReplyDto extends ServiceAccountSelectorDto {
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Canonical Rich Content Schema v2 document. Submit with content_schema_version: 2; Markdown content is a legacy projection.' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2] })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;
}

export class ExternalModeratePostDto extends ServiceAccountSelectorDto {
  @IsString()
  @IsIn(['approve', 'reject', 'pin', 'unpin', 'lock', 'unlock', 'move', 'best_reply', 'clear_best_reply'])
  action: 'approve' | 'reject' | 'pin' | 'unpin' | 'lock' | 'unlock' | 'move' | 'best_reply' | 'clear_best_reply';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @IsNumber()
  reply_id?: number;
}

export class ExternalModerateReplyDto extends ServiceAccountSelectorDto {
  @IsString()
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ExternalCreateResourceDto extends ServiceAccountSelectorDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  resource_type: string;

  @IsOptional()
  @IsString()
  external_url?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Rich Content Schema v2 source for the long description.' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2] })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;

  @IsOptional()
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;
}

export class ExternalUpdateResourceDto extends ServiceAccountSelectorDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  resource_type?: string;

  @IsOptional()
  @IsString()
  external_url?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: () => TiptapDocumentDto, description: 'Rich Content Schema v2 source for the long description.' })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: [2] })
  @IsOptional() @IsInt() @Min(1) @Max(2)
  content_schema_version?: number;

  @IsOptional()
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;
}

export class ExternalModerateResourceDto extends ServiceAccountSelectorDto {
  @IsString()
  @IsIn(['approve', 'reject', 'pending'])
  action: 'approve' | 'reject' | 'pending';
}
