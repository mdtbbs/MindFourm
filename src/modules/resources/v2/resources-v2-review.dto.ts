import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ResourceV2VersionReviewDto {
  @ApiProperty({ enum: ['approve', 'reject', 'request_changes'] })
  @IsIn(['approve', 'reject', 'request_changes'])
  action!: 'approve' | 'reject' | 'request_changes';

  @ApiPropertyOptional({ maxLength: 5_000, description: '审核说明；reject 和 request_changes 必填。' })
  @IsOptional() @IsString() @MaxLength(5_000)
  reason?: string;
}

export class ResourceV2ReviewAnnotationValueDto {
  @ApiProperty({ example: 'manifest.source_url' }) field_path!: string;
  @ApiProperty({ enum: ['ERROR', 'WARNING', 'INFO'] }) severity!: string;
  @ApiProperty() body!: string;
}

export class ResourceV2ReviewTimelineEventDto {
  @ApiProperty({ format: 'uuid' }) resource_public_id!: string;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) version_public_id!: string | null;
  @ApiProperty() event_type!: string;
  @ApiProperty({ nullable: true, type: String }) result!: string | null;
  @ApiProperty({ nullable: true, type: String }) reason!: string | null;
  @ApiProperty({ nullable: true, type: String }) finding_key!: string | null;
  @ApiProperty({ nullable: true, type: ResourceV2ReviewAnnotationValueDto }) annotation!: ResourceV2ReviewAnnotationValueDto | null;
  @ApiProperty({ nullable: true, type: String }) actor!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) timestamp!: string | null;
  @ApiProperty({ nullable: true, type: String }) parser_version!: string | null;
}

export class ResourceV2ReviewTimelineResponseDto {
  @ApiProperty({ type: [ResourceV2ReviewTimelineEventDto] }) items!: ResourceV2ReviewTimelineEventDto[];
  @ApiProperty({ type: 'object', properties: { limit: { type: 'integer' }, offset: { type: 'integer' }, has_more: { type: 'boolean' } } })
  pagination!: { limit: number; offset: number; has_more: boolean };
}

export class ResourceV2FindingOverrideResponseDto {
  @ApiProperty({ format: 'uuid' }) resource_public_id!: string;
  @ApiProperty({ format: 'uuid' }) version_public_id!: string;
  @ApiProperty() finding_key!: string;
  @ApiProperty({ enum: ['ERROR', 'WARNING'] }) severity!: string;
  @ApiProperty() ignored!: boolean;
  @ApiProperty({ nullable: true, type: String }) reason!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) actor?: string | null;
  @ApiPropertyOptional({ format: 'date-time' }) timestamp?: string;
  @ApiProperty({ nullable: true, type: String }) parser_version!: string | null;
  @ApiPropertyOptional() changed?: boolean;
}

export class ResourceV2ReviewAnnotationResponseDto {
  @ApiProperty({ format: 'uuid' }) resource_public_id!: string;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) version_public_id!: string | null;
  @ApiProperty() field_path!: string;
  @ApiProperty({ enum: ['ERROR', 'WARNING', 'INFO'] }) severity!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ nullable: true, type: String }) actor!: string | null;
  @ApiProperty({ format: 'date-time' }) timestamp!: string;
  @ApiProperty({ nullable: true, type: String }) parser_version!: string | null;
}

export class ResourceV2FindingOverrideDto {
  @ApiProperty({ maxLength: 191, example: 'missing-dependency-version' })
  @IsString() @MinLength(1) @MaxLength(191)
  finding_key!: string;

  @ApiProperty({ maxLength: 5_000, description: '说明忽略该 ERROR/WARNING 的原因。' })
  @IsString() @MinLength(1) @MaxLength(5_000)
  reason!: string;
}

export class ResourceV2ClearFindingOverrideDto {
  @ApiProperty({ maxLength: 191, example: 'missing-dependency-version' })
  @IsString() @MinLength(1) @MaxLength(191)
  finding_key!: string;

  @ApiPropertyOptional({ maxLength: 5_000 })
  @IsOptional() @IsString() @MaxLength(5_000)
  reason?: string | null;
}

export class ResourceV2ReviewAnnotationDto {
  @ApiPropertyOptional({ format: 'uuid', description: '可选版本 public UUID；省略表示资源级批注。' })
  @IsOptional() @IsUUID()
  version_public_id?: string;

  @ApiProperty({ maxLength: 191, example: 'manifest.source_url' })
  @IsString() @MinLength(1) @MaxLength(191)
  field_path!: string;

  @ApiProperty({ enum: ['ERROR', 'WARNING', 'INFO'] })
  @IsIn(['ERROR', 'WARNING', 'INFO'])
  severity!: 'ERROR' | 'WARNING' | 'INFO';

  @ApiProperty({ maxLength: 20_000 })
  @IsString() @MinLength(1) @MaxLength(20_000)
  body!: string;
}

export class ResourceV2ReviewTimelineQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  version_public_id?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 50;

  @ApiPropertyOptional({ minimum: 0, maximum: 100_000, default: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000)
  offset = 0;
}
