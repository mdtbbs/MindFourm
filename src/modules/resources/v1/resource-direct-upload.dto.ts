import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { MAX_RESOURCE_SIZE } from '../resources.controller';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitResourceDirectUploadDto {
  @ApiProperty({ format: 'uuid', description: 'Public ID of an existing draft or pending resource version.' })
  @IsUUID()
  version_public_id: string;

  @ApiProperty({ maxLength: 500, example: 'map.msav' })
  @IsString()
  @MaxLength(500)
  filename: string;

  @ApiProperty({ minimum: 1, maximum: MAX_RESOURCE_SIZE, example: 123456 })
  @IsInt()
  @Min(1)
  @Max(MAX_RESOURCE_SIZE)
  size_bytes: number;

  @ApiProperty({ maxLength: 100, example: 'application/octet-stream' })
  @IsString()
  @MaxLength(100)
  mime_type: string;

  @ApiProperty({ pattern: '^[a-fA-F0-9]{64}$', description: 'Required SHA-256 binds the verified object to this upload context.' })
  @Matches(/^[a-fA-F0-9]{64}$/)
  sha256: string;

  @ApiPropertyOptional({ enum: ['primary', 'supplementary', 'documentation'], default: 'primary' })
  @IsOptional()
  @IsIn(['primary', 'supplementary', 'documentation'])
  role?: string;
}

export class CompleteResourceDirectUploadDto {
  @ApiProperty({ format: 'uuid', description: 'Forum upload context ID returned by init.' })
  @IsUUID()
  session_id: string;

  @ApiProperty({ maxLength: 128, description: 'RES public object ID returned by deduplication or binary PUT.' })
  @IsString()
  @MaxLength(128)
  object_public_id: string;
}

export class ResourceDirectUploadTokenDto {
  @ApiProperty() session_id: string;
  @ApiProperty({ format: 'uri' }) url: string;
  @ApiProperty({ description: 'Short-lived upload token. Never the RES service API key.' }) token: string;
  @ApiProperty({ format: 'date-time' }) expires_at: string;
}

export class ResourceDirectUploadInitResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() deduplicated: boolean;
  @ApiProperty({ enum: [true] }) complete_required: boolean;
  @ApiPropertyOptional() object_id?: string;
  @ApiPropertyOptional() object_public_id?: string;
  @ApiPropertyOptional({ type: ResourceDirectUploadTokenDto }) upload?: ResourceDirectUploadTokenDto;
}

export class ResourceDirectUploadCompleteResponseDto {
  @ApiProperty({ format: 'uuid' }) file_public_id: string;
  @ApiProperty({ enum: [true] }) completed: boolean;
}

export class ResourceDirectUploadDraftResponseDto {
  @ApiProperty({ format: 'uuid' }) resource_public_id: string;
  @ApiPropertyOptional({ description: 'Legacy numeric Resource ID for navigation after initial upload.' }) resource_id?: number;
  @ApiProperty({ format: 'uuid' }) version_public_id: string;
  @ApiProperty({ format: 'uuid' }) upload_draft_id: string;
  @ApiProperty({ format: 'date-time' }) expires_at: string;
  @ApiProperty({ enum: ['open', 'completed'] }) draft_status: 'open' | 'completed';
  @ApiProperty({ enum: ['upload_pending', 'pending_review'] }) version_status: 'upload_pending' | 'pending_review';
  @ApiPropertyOptional({ minimum: 1 }) revision?: number;
}
