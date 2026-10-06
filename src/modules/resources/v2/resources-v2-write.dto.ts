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

export class ResourceV2SchematicMoveDto {
  @ApiProperty({ minimum: 0, maximum: 127 })
  @IsInt() @Min(0) @Max(127)
  from_x!: number;

  @ApiProperty({ minimum: 0, maximum: 127 })
  @IsInt() @Min(0) @Max(127)
  from_y!: number;

  @ApiProperty({ minimum: 0, maximum: 127 })
  @IsInt() @Min(0) @Max(127)
  to_x!: number;

  @ApiProperty({ minimum: 0, maximum: 127 })
  @IsInt() @Min(0) @Max(127)
  to_y!: number;
}

export class ResourceV2SchematicAddedBlockDto {
  @ApiProperty({ minimum: 0, maximum: 127 })
  @IsInt() @Min(0) @Max(127)
  x!: number;

  @ApiProperty({ minimum: 0, maximum: 127 })
  @IsInt() @Min(0) @Max(127)
  y!: number;

  @ApiProperty({ maxLength: 191, example: 'router' })
  @IsString() @MinLength(1) @MaxLength(191)
  block!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 3, default: 0 })
  @IsOptional() @IsInt() @Min(0) @Max(3)
  rotation?: number;
}

export class ResourceV2SchematicLogicConfigDto {
  @ApiProperty({ minimum: 0, maximum: 127 })
  @IsInt() @Min(0) @Max(127)
  x!: number;

  @ApiProperty({ minimum: 0, maximum: 127 })
  @IsInt() @Min(0) @Max(127)
  y!: number;

  @ApiProperty({ maxLength: 32_768, description: 'Inert processor source text; never evaluated by the renderer.' })
  @IsString() @MaxLength(32_768)
  source!: string;
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

  @ApiPropertyOptional({ type: [ResourceV2SchematicMoveDto], maxItems: 5_000 })
  @IsOptional() @IsArray() @ArrayMaxSize(5_000) @ValidateNested({ each: true }) @Type(() => ResourceV2SchematicMoveDto)
  move_positions?: ResourceV2SchematicMoveDto[];

  @ApiPropertyOptional({ type: [ResourceV2SchematicAddedBlockDto], maxItems: 5_000 })
  @IsOptional() @IsArray() @ArrayMaxSize(5_000) @ValidateNested({ each: true }) @Type(() => ResourceV2SchematicAddedBlockDto)
  add_blocks?: ResourceV2SchematicAddedBlockDto[];

  @ApiPropertyOptional({ type: [ResourceV2SchematicLogicConfigDto], maxItems: 1_000 })
  @IsOptional() @IsArray() @ArrayMaxSize(1_000) @ValidateNested({ each: true }) @Type(() => ResourceV2SchematicLogicConfigDto)
  logic_configs?: ResourceV2SchematicLogicConfigDto[];
}

export class ResourceV2MapTerrainChangeDto {
  @ApiProperty({ minimum: 0, maximum: 32_767 })
  @IsInt() @Min(0) @Max(32_767)
  x!: number;

  @ApiProperty({ minimum: 0, maximum: 32_767 })
  @IsInt() @Min(0) @Max(32_767)
  y!: number;

  @ApiProperty({ maxLength: 191, example: 'sand' })
  @IsString() @MinLength(1) @MaxLength(191)
  floor!: string;

  @ApiProperty({ maxLength: 191, example: 'air', description: 'Overlay block name; use air to clear an existing overlay.' })
  @IsString() @MaxLength(191)
  overlay!: string;
}

export class ResourceV2MapWaveOperationDto {
  @ApiProperty({ enum: ['add', 'update', 'delete', 'move'] })
  @IsIn(['add', 'update', 'delete', 'move'])
  action!: 'add' | 'update' | 'delete' | 'move';

  @ApiProperty({ minimum: 0, maximum: 5_000 })
  @IsInt() @Min(0) @Max(5_000)
  index!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5_000 })
  @IsOptional() @IsInt() @Min(0) @Max(5_000)
  to_index?: number;

  @ApiPropertyOptional({ type: 'object', description: 'Known SpawnGroup fields to add or update. Unknown source fields remain intact.' })
  @IsOptional() @IsObject()
  fields?: Record<string, unknown>;
}

export class ResourceV2ExportMapDto {
  @ApiPropertyOptional({ type: [ResourceV2MapTerrainChangeDto], maxItems: 5_000 })
  @IsOptional() @IsArray() @ArrayMaxSize(5_000) @ValidateNested({ each: true }) @Type(() => ResourceV2MapTerrainChangeDto)
  terrain_changes?: ResourceV2MapTerrainChangeDto[];

  @ApiPropertyOptional({ type: 'object', description: 'Typed scalar/list Rules fields. Unspecified and unknown source fields are preserved.' })
  @IsOptional() @IsObject()
  rule_changes?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [ResourceV2MapWaveOperationDto], maxItems: 1_000 })
  @IsOptional() @IsArray() @ArrayMaxSize(1_000) @ValidateNested({ each: true }) @Type(() => ResourceV2MapWaveOperationDto)
  wave_operations?: ResourceV2MapWaveOperationDto[];
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

export class ResourceV2RespondInvitationDto {
  @ApiProperty({ type: 'boolean' })
  @IsBoolean()
  accept!: boolean;
}
