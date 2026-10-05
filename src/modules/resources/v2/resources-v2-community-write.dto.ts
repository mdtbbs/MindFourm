import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength,
  ValidateNested,
} from 'class-validator';

export class ResourceV2CommunityReportBaseDto {
  // Actual report attachments are accepted only by the private binary routes.
}

export class ResourceV2MapFeedbackDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  difficulty?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  resource_sufficiency?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  balance?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  multiplayer_experience?: number;

  @ApiPropertyOptional({ maxLength: 5_000 })
  @IsOptional() @IsString() @MaxLength(5_000)
  body?: string | null;
}

export class ResourceV2ModCompatibilityReportDto extends ResourceV2CommunityReportBaseDto {
  @ApiProperty({ enum: ['working', 'partial', 'cannot_start', 'crash', 'performance', 'multiplayer'] })
  @IsIn(['working', 'partial', 'cannot_start', 'crash', 'performance', 'multiplayer'])
  status!: 'working' | 'partial' | 'cannot_start' | 'crash' | 'performance' | 'multiplayer';

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @IsString() @MaxLength(80)
  game_version?: string | null;

  @ApiPropertyOptional({ maxLength: 50, pattern: '^[A-Za-z0-9_.:-]+$' })
  @IsOptional() @IsString() @MaxLength(50)
  platform_key?: string | null;

  @ApiPropertyOptional({ enum: ['java', 'js', 'hybrid', 'content'] })
  @IsOptional() @IsIn(['java', 'js', 'hybrid', 'content'])
  runtime?: 'java' | 'js' | 'hybrid' | 'content' | null;

  @ApiPropertyOptional({ maxLength: 20_000 })
  @IsOptional() @IsString() @MaxLength(20_000)
  body?: string | null;
}

export class ResourceV2ModIssueReportDto extends ResourceV2CommunityReportBaseDto {
  @ApiProperty({ maxLength: 255 })
  @IsString() @MinLength(1) @MaxLength(255)
  title!: string;

  @ApiProperty({ maxLength: 20_000 })
  @IsString() @MinLength(1) @MaxLength(20_000)
  body!: string;
}

export class ResourceV2AuthorResponseDto {
  @ApiProperty({ enum: ['confirmed', 'cannot_reproduce', 'fixed', 'not_mod_issue'] })
  @IsIn(['confirmed', 'cannot_reproduce', 'fixed', 'not_mod_issue'])
  author_response_status!: 'confirmed' | 'cannot_reproduce' | 'fixed' | 'not_mod_issue';

  @ApiPropertyOptional({ maxLength: 10_000 })
  @IsOptional() @IsString() @MaxLength(10_000)
  author_response?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required when author_response_status is fixed.' })
  @IsOptional() @IsString() @MaxLength(36)
  fixed_resource_version_public_id?: string;
}

export class ResourceV2ModConflictMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsString() @MaxLength(36)
  resource_public_id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsString() @MaxLength(36)
  version_public_id!: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  version_constraint?: string | null;
}

export class ResourceV2ModConflictReportDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  title?: string | null;

  @ApiPropertyOptional({ maxLength: 20_000 })
  @IsOptional() @IsString() @MaxLength(20_000)
  body?: string | null;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @IsString() @MaxLength(80)
  game_version_min?: string | null;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @IsString() @MaxLength(80)
  game_version_max?: string | null;

  @ApiProperty({ type: [ResourceV2ModConflictMemberDto], minItems: 2, maxItems: 10 })
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ResourceV2ModConflictMemberDto)
  members!: ResourceV2ModConflictMemberDto[];
}

export class ResourceV2ModConflictAuthorResponseDto extends ResourceV2AuthorResponseDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Resource UUID for the Mod whose published release fixes the conflict.' })
  @IsOptional() @IsString() @MaxLength(36)
  fixed_resource_public_id?: string;
}
