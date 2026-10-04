import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ResourceV2SchematicPositionDto {
  @ApiProperty({ minimum: 0, maximum: 127 })
  @IsInt() @Min(0) @Max(127)
  x!: number;

  @ApiProperty({ minimum: 0, maximum: 127 })
  @IsInt() @Min(0) @Max(127)
  y!: number;
}

export class ResourceV2ExportSchematicDto {
  @ApiProperty({ minimum: 0, maximum: 3, description: 'Number of 90 degree counter-clockwise rotations.' })
  @IsInt() @Min(0) @Max(3)
  rotation_quarters!: number;

  @ApiProperty({ description: 'Reflect the edited schematic horizontally.' })
  @IsBoolean()
  mirror_x!: boolean;

  @ApiPropertyOptional({ type: [ResourceV2SchematicPositionDto], maxItems: 10_000 })
  @IsOptional() @IsArray() @ArrayMaxSize(10_000) @ValidateNested({ each: true }) @Type(() => ResourceV2SchematicPositionDto)
  delete_positions?: ResourceV2SchematicPositionDto[];
}

export class ResourceV2CreateVersionDto {
  @ApiProperty({ maxLength: 50, example: '1.2.0' })
  @IsString() @MinLength(1) @MaxLength(50)
  version!: string;

  @ApiPropertyOptional({ enum: ['semver', 'compatibility'] })
  @IsOptional() @IsIn(['semver', 'compatibility'])
  version_mode?: 'semver' | 'compatibility';

  @ApiPropertyOptional({ enum: ['release', 'beta', 'alpha', 'snapshot'] })
  @IsOptional() @IsIn(['release', 'beta', 'alpha', 'snapshot'])
  release_channel?: 'release' | 'beta' | 'alpha' | 'snapshot';

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @IsString() @MaxLength(80)
  game_version_min?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @IsString() @MaxLength(80)
  game_version_max?: string;

  @ApiPropertyOptional({ maxLength: 20_000, description: 'Markdown release notes.' })
  @IsOptional() @IsString() @MaxLength(20_000)
  content?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional() @IsString() @MaxLength(128)
  mod_id?: string;

  @ApiPropertyOptional({ type: 'object', description: 'Publisher overrides remain separate from parsed manifest values.' })
  @IsOptional() @IsObject()
  mod_author_overrides?: Record<string, unknown>;
}

export class ResourceV2PatchProfileDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2_000 })
  @IsOptional() @IsString() @MaxLength(2_000)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 100_000 })
  @IsOptional() @IsString() @MaxLength(100_000)
  content?: string | null;

  @ApiPropertyOptional({ maxLength: 2_000, format: 'uri' })
  @IsOptional() @IsString() @MaxLength(2_000)
  source_url?: string | null;

  @ApiPropertyOptional({ maxLength: 191 })
  @IsOptional() @IsString() @MaxLength(191)
  license?: string | null;
}

export class ResourceV2CreateRelationDto {
  @ApiProperty({ format: 'uuid' })
  @IsString() @MaxLength(36)
  target_resource_public_id!: string;

  @ApiProperty({ example: 'recommended_for', enum: ['recommended_for', 'fork_of', 'successor_of', 'related', 'requires', 'compatible_with'] })
  @IsString() @IsIn(['recommended_for', 'fork_of', 'successor_of', 'related', 'requires', 'compatible_with']) @MinLength(2) @MaxLength(40)
  relation_type!: string;

  @ApiPropertyOptional({ enum: ['opening', 'production', 'defense', 'logistics', 'general'], default: 'general' })
  @IsOptional() @IsIn(['opening', 'production', 'defense', 'logistics', 'general'])
  relation_context?: 'opening' | 'production' | 'defense' | 'logistics' | 'general';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsString() @MaxLength(36)
  source_version_public_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsString() @MaxLength(36)
  target_version_public_id?: string;
}

export class ResourceV2InviteMemberDto {
  @ApiProperty({ maxLength: 100 })
  @IsString() @MinLength(1) @MaxLength(100)
  username!: string;

  @ApiProperty({ enum: ['maintainer', 'publisher'] })
  @IsIn(['maintainer', 'publisher'])
  role!: 'maintainer' | 'publisher';
}

export class ResourceV2TransferOwnerDto {
  @ApiProperty({ maxLength: 100 })
  @IsString() @MinLength(1) @MaxLength(100)
  username!: string;
}
