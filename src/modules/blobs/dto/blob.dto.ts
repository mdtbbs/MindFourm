import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/** Longest logical name accepted for a blob key. */
export const MAX_BLOB_KEY_LENGTH = 255;
/** Hard ceiling for one object, independent of the configurable per-deployment limit. */
export const MAX_BLOB_OBJECT_BYTES = 512 * 1024 * 1024;

export class CreateBlobDto {
  @ApiPropertyOptional({
    maxLength: 64,
    default: 'default',
    pattern: '^[a-z0-9][a-z0-9_-]{0,63}$',
    description: 'Storage namespace ("bucket"). Namespaces isolate key names and listing; they are not a security boundary inside one owner.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/)
  namespace?: string;

  @ApiProperty({ maxLength: MAX_BLOB_KEY_LENGTH, example: 'cover/v2.png', description: 'Logical name, unique among the live blobs of one owner in a namespace. Reusing it replaces the previous blob.' })
  @IsString()
  @MaxLength(MAX_BLOB_KEY_LENGTH)
  key: string;

  @ApiProperty({ maxLength: 255, example: 'theme.png' })
  @IsString()
  @MaxLength(255)
  file_name: string;

  @ApiProperty({ minimum: 1, maximum: MAX_BLOB_OBJECT_BYTES, example: 20480 })
  @IsInt()
  @Min(1)
  @Max(MAX_BLOB_OBJECT_BYTES)
  size_bytes: number;

  @ApiProperty({ pattern: '^[a-fA-F0-9]{64}$', description: 'Required SHA-256 of the exact bytes. It binds the upload session to the content the caller claims to hold.' })
  @Matches(/^[a-fA-F0-9]{64}$/)
  sha256: string;

  @ApiProperty({ maxLength: 100, example: 'image/png' })
  @IsString()
  @MaxLength(100)
  @Matches(/^[\w.+-]+\/[\w.+-]+$/)
  mime_type: string;

  @ApiPropertyOptional({ enum: ['private', 'public'], default: 'private', description: 'Private blobs are readable only by their owner; public blobs are readable by anyone holding the blob ID.' })
  @IsOptional()
  @IsIn(['private', 'public'])
  visibility?: 'private' | 'public';

  @ApiPropertyOptional({ description: 'Free-form JSON metadata. Business data lives with the owning service, not here.' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String], maxItems: 32, example: ['post-attachment'] })
  @IsOptional()
  @IsArray()
  @MaxLength(64, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ maxLength: 32, description: 'Optional opaque correlation to the business object this blob belongs to.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  ref_type?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ref_id?: string;

  @ApiPropertyOptional({ minimum: 60, maximum: 2_592_000, description: 'Lifetime in seconds. Temporary blobs are deleted by maintenance once expired; omit for a durable blob.' })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(2_592_000)
  expires_in_seconds?: number;
}

export class UpdateBlobDto {
  @ApiPropertyOptional({ maxLength: MAX_BLOB_KEY_LENGTH, description: 'New logical name. Renaming onto a live key replaces that blob.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BLOB_KEY_LENGTH)
  key?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  file_name?: string;

  @ApiPropertyOptional({ enum: ['private', 'public'] })
  @IsOptional()
  @IsIn(['private', 'public'])
  visibility?: 'private' | 'public';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: [String], nullable: true, maxItems: 32 })
  @IsOptional()
  @IsArray()
  @MaxLength(64, { each: true })
  tags?: string[] | null;

  @ApiPropertyOptional({ maxLength: 32, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  ref_type?: string | null;

  @ApiPropertyOptional({ maxLength: 64, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ref_id?: string | null;
}

export class ListBlobsQueryDto {
  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  namespace?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  ref_type?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ref_id?: string;

  @ApiPropertyOptional({ maxLength: 300, description: 'Opaque cursor from meta.next_cursor.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class BlobUploadTargetDto {
  @ApiProperty({ format: 'uri', description: 'Absolute URL to PUT the raw bytes to.' })
  url: string;

  @ApiProperty({ format: 'date-time' })
  expires_at: string;
}

export class BlobDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  namespace: string;

  @ApiProperty({ description: 'Logical name chosen by the owner.' })
  key: string;

  @ApiProperty({ enum: ['private', 'public'] })
  visibility: 'private' | 'public';

  @ApiProperty()
  file_name: string;

  @ApiProperty()
  mime_type: string;

  @ApiProperty({ minimum: 1 })
  size_bytes: number;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  sha256: string;

  @ApiProperty({ nullable: true, type: Object, description: 'Caller-supplied JSON metadata.' })
  metadata: Record<string, unknown> | null;

  @ApiProperty({ type: [String], nullable: true })
  tags: string[] | null;

  @ApiProperty({ nullable: true })
  ref_type: string | null;

  @ApiProperty({ nullable: true })
  ref_id: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, description: 'Expiry for temporary blobs; null for durable blobs.' })
  expires_at: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at: string;

  @ApiProperty({ format: 'date-time' })
  updated_at: string;

  @ApiProperty({ format: 'uri', description: 'Stable authenticated URL that returns the bytes.' })
  content_url: string;
}

export class BlobCreatedDto {
  @ApiProperty({ format: 'uuid' })
  blob_id: string;

  @ApiProperty({ description: 'True when identical bytes already exist for this owner, so no PUT is required before commit.' })
  deduplicated: boolean;

  @ApiProperty({ enum: [true] })
  commit_required: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Upload session ID. Present whenever bytes still have to be transferred.' })
  upload_id?: string;

  @ApiPropertyOptional({ type: BlobUploadTargetDto, description: 'Present when the caller must PUT the bytes before committing.' })
  upload?: BlobUploadTargetDto;
}

export class BlobCommitResponseDto {
  @ApiProperty({ type: BlobDto })
  blob: BlobDto;

  @ApiProperty({ enum: [true] })
  committed: boolean;
}

export class BlobDeletedDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: [true] })
  deleted: boolean;
}

export class BlobUsageDto {
  @ApiProperty({ description: 'Bytes held by live blobs, including bytes still referenced by pending uploads.' })
  used_bytes: number;

  @ApiProperty()
  limit_bytes: number;

  @ApiProperty()
  max_object_bytes: number;

  @ApiProperty()
  blob_count: number;
}
