import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { ArrayMaxSize, Equals, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
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

export class ResourceV2SchematicRotateDto {
  @ApiProperty({ minimum: 0, maximum: 127 }) @IsInt() @Min(0) @Max(127) x!: number;
  @ApiProperty({ minimum: 0, maximum: 127 }) @IsInt() @Min(0) @Max(127) y!: number;
  @ApiProperty({ minimum: 1, maximum: 3, description: 'Clockwise quarter turns applied to one block.' })
  @IsInt() @Min(1) @Max(3) rotation_quarters!: number;
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

export class ResourceV2SchematicPointConfigDto {
  @ApiProperty({ enum: ['point'] }) @Equals('point') type: 'point' = 'point';
  @ApiProperty({ minimum: -127, maximum: 127, description: 'Relative x offset; the resulting reference must remain inside the schematic.' }) @IsInt() @Min(-127) @Max(127) x!: number;
  @ApiProperty({ minimum: -127, maximum: 127, description: 'Relative y offset; the resulting reference must remain inside the schematic.' }) @IsInt() @Min(-127) @Max(127) y!: number;
}

export class ResourceV2SchematicPointPairDto {
  @ApiProperty({ type: Number, minimum: -127, maximum: 127 }) @IsInt() @Min(-127) @Max(127) x!: number;
  @ApiProperty({ type: Number, minimum: -127, maximum: 127 }) @IsInt() @Min(-127) @Max(127) y!: number;
}

export class ResourceV2SchematicVectorPairDto {
  @ApiProperty({ type: Number, minimum: 0, maximum: 127 }) @IsNumber({ allowInfinity: false, allowNaN: false }) @Min(0) @Max(127) x!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 127 }) @IsNumber({ allowInfinity: false, allowNaN: false }) @Min(0) @Max(127) y!: number;
}

export class ResourceV2SchematicPointArrayConfigDto {
  @ApiProperty({ enum: ['point_array'] }) @Equals('point_array') type: 'point_array' = 'point_array';
  @ApiProperty({ type: [ResourceV2SchematicPointPairDto], maxItems: 255 }) @IsArray() @ArrayMaxSize(255) @ValidateNested({ each: true }) @Type(() => ResourceV2SchematicPointPairDto) points!: ResourceV2SchematicPointPairDto[];
}

export class ResourceV2SchematicConfigNoneDto {
  @ApiProperty({ enum: ['none'] }) @Equals('none') type: 'none' = 'none';
}

export class ResourceV2SchematicIntegerConfigDto {
  @ApiProperty({ enum: ['integer'] }) @Equals('integer') type: 'integer' = 'integer';
  @ApiProperty({ type: Number, minimum: -2147483648, maximum: 2147483647 }) @IsInt() value!: number;
}

export class ResourceV2SchematicLongConfigDto {
  @ApiProperty({ enum: ['long'] }) @Equals('long') type: 'long' = 'long';
  @ApiProperty({ type: String, pattern: '^(?:0|[1-9][0-9]{0,17}|[1-8][0-9]{18}|9223372036854775807|-(?:[1-9][0-9]{0,17}|[1-8][0-9]{18}|9223372036854775808))$', description: 'Canonical signed 64-bit decimal string preserves the full integer.' }) @IsString() @Matches(/^(?:0|[1-9][0-9]{0,17}|[1-8][0-9]{18}|9223372036854775807|-(?:[1-9][0-9]{0,17}|[1-8][0-9]{18}|9223372036854775808))$/) @MaxLength(20) value!: string;
}

export class ResourceV2SchematicFloatConfigDto {
  @ApiProperty({ enum: ['float'] }) @Equals('float') type: 'float' = 'float';
  @ApiProperty({ type: Number, minimum: -1000000, maximum: 1000000 }) @IsNumber({ allowInfinity: false, allowNaN: false }) @Min(-1_000_000) @Max(1_000_000) value!: number;
}

export class ResourceV2SchematicDoubleConfigDto {
  @ApiProperty({ enum: ['double'] }) @Equals('double') type: 'double' = 'double';
  @ApiProperty({ type: Number, minimum: -1000000000, maximum: 1000000000 }) @IsNumber({ allowInfinity: false, allowNaN: false }) @Min(-1_000_000_000) @Max(1_000_000_000) value!: number;
}

export class ResourceV2SchematicBooleanConfigDto {
  @ApiProperty({ enum: ['boolean'] }) @Equals('boolean') type: 'boolean' = 'boolean';
  @ApiProperty() @IsBoolean() value!: boolean;
}

export class ResourceV2SchematicTextConfigDto {
  @ApiProperty({ enum: ['text'] }) @Equals('text') type: 'text' = 'text';
  @ApiProperty({ maxLength: 1200, description: 'Typed text configuration, such as a message block.' }) @IsString() @MaxLength(1200) value!: string;
}

export class ResourceV2SchematicContentConfigDto {
  @ApiProperty({ enum: ['content'] }) @Equals('content') type: 'content' = 'content';
  @ApiProperty({ enum: ['item', 'liquid', 'unit', 'block', 'unitCommand', 'status', 'planet', 'weather'] })
  @IsIn(['item', 'liquid', 'unit', 'block', 'unitCommand', 'status', 'planet', 'weather']) content_type!: string;
  @ApiProperty({ maxLength: 191, pattern: '^[a-zA-Z0-9_.:-]+$', example: 'copper', description: 'Official v160.5 content name; the renderer validates it against the pinned content registry.' }) @IsString() @Matches(/^[a-zA-Z0-9_.:-]{1,191}$/) @MinLength(1) @MaxLength(191) name!: string;
}

export class ResourceV2SchematicTechNodeConfigDto {
  @ApiProperty({ enum: ['tech_node'] }) @Equals('tech_node') type: 'tech_node' = 'tech_node';
  @ApiProperty({ enum: ['item', 'block', 'unit', 'liquid', 'status', 'planet'] }) @IsIn(['item', 'block', 'unit', 'liquid', 'status', 'planet']) content_type!: string;
  @ApiProperty({ maxLength: 191, pattern: '^[a-zA-Z0-9_.:-]+$' }) @IsString() @Matches(/^[a-zA-Z0-9_.:-]{1,191}$/) @MinLength(1) @MaxLength(191) name!: string;
}

export class ResourceV2SchematicIntegerArrayConfigDto {
  @ApiProperty({ enum: ['int_seq', 'int_array'] }) @IsIn(['int_seq', 'int_array']) type!: 'int_seq' | 'int_array';
  @ApiProperty({ type: [Number], maxItems: 1000, minimum: -16384, maximum: 16383 }) @IsArray() @ArrayMaxSize(1000) @IsInt({ each: true }) @Min(-16384, { each: true }) @Max(16383, { each: true }) values!: number[];
}

export class ResourceV2SchematicBooleanArrayConfigDto {
  @ApiProperty({ enum: ['boolean_array'] }) @Equals('boolean_array') type: 'boolean_array' = 'boolean_array';
  @ApiProperty({ type: [Boolean], maxItems: 1000 }) @IsArray() @ArrayMaxSize(1000) @IsBoolean({ each: true }) values!: boolean[];
}

export class ResourceV2SchematicVectorConfigDto {
  @ApiProperty({ enum: ['vec2'] }) @Equals('vec2') type: 'vec2' = 'vec2';
  @ApiProperty({ type: Number, minimum: 0, maximum: 127 }) @IsNumber({ allowInfinity: false, allowNaN: false }) @Min(0) @Max(127) x!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 127 }) @IsNumber({ allowInfinity: false, allowNaN: false }) @Min(0) @Max(127) y!: number;
}

export class ResourceV2SchematicVectorArrayConfigDto {
  @ApiProperty({ enum: ['vec2_array'] }) @Equals('vec2_array') type: 'vec2_array' = 'vec2_array';
  @ApiProperty({ type: [ResourceV2SchematicVectorPairDto], maxItems: 1000 }) @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => ResourceV2SchematicVectorPairDto) points!: ResourceV2SchematicVectorPairDto[];
}

export class ResourceV2SchematicTeamConfigDto {
  @ApiProperty({ enum: ['team'] }) @Equals('team') type: 'team' = 'team';
  @ApiProperty({ example: 'sharded' }) @IsString() @MinLength(1) @MaxLength(40) name!: string;
}

export class ResourceV2SchematicAccessConfigDto {
  @ApiProperty({ enum: ['l_access'] }) @Equals('l_access') type: 'l_access' = 'l_access';
  @ApiProperty({ maxLength: 40, example: 'health' }) @IsString() @MinLength(1) @MaxLength(40) name!: string;
}

export class ResourceV2SchematicUnitCommandConfigDto {
  @ApiProperty({ enum: ['unit_command'] }) @Equals('unit_command') type: 'unit_command' = 'unit_command';
  @ApiProperty({ maxLength: 100, example: 'move' }) @IsString() @MinLength(1) @MaxLength(100) name!: string;
}

export class ResourceV2SchematicColorConfigDto {
  @ApiProperty({ enum: ['color'] }) @Equals('color') type: 'color' = 'color';
  @ApiProperty({ type: String, pattern: '^#[0-9a-fA-F]{8}$', example: '#ffffff00', description: 'RGBA8888 color supported by the official illuminator block.' }) @IsString() @Matches(/^#[0-9a-fA-F]{8}$/) @MaxLength(9) value!: string;
}

export type ResourceV2SchematicConfigDtoUnion = ResourceV2SchematicConfigNoneDto | ResourceV2SchematicIntegerConfigDto
  | ResourceV2SchematicLongConfigDto | ResourceV2SchematicFloatConfigDto | ResourceV2SchematicDoubleConfigDto
  | ResourceV2SchematicBooleanConfigDto | ResourceV2SchematicTextConfigDto | ResourceV2SchematicContentConfigDto
  | ResourceV2SchematicTechNodeConfigDto | ResourceV2SchematicPointConfigDto | ResourceV2SchematicPointArrayConfigDto
  | ResourceV2SchematicIntegerArrayConfigDto | ResourceV2SchematicBooleanArrayConfigDto | ResourceV2SchematicVectorConfigDto
  | ResourceV2SchematicVectorArrayConfigDto | ResourceV2SchematicTeamConfigDto | ResourceV2SchematicAccessConfigDto
  | ResourceV2SchematicUnitCommandConfigDto | ResourceV2SchematicColorConfigDto;

export class ResourceV2SchematicConfigEditDto {
  @ApiProperty({ minimum: 0, maximum: 127 }) @IsInt() @Min(0) @Max(127) x!: number;
  @ApiProperty({ minimum: 0, maximum: 127 }) @IsInt() @Min(0) @Max(127) y!: number;
  @ApiProperty({ oneOf: [
    ResourceV2SchematicConfigNoneDto, ResourceV2SchematicIntegerConfigDto, ResourceV2SchematicLongConfigDto,
    ResourceV2SchematicFloatConfigDto, ResourceV2SchematicDoubleConfigDto, ResourceV2SchematicBooleanConfigDto,
    ResourceV2SchematicTextConfigDto, ResourceV2SchematicContentConfigDto, ResourceV2SchematicTechNodeConfigDto,
    ResourceV2SchematicPointConfigDto, ResourceV2SchematicPointArrayConfigDto, ResourceV2SchematicIntegerArrayConfigDto,
    ResourceV2SchematicBooleanArrayConfigDto, ResourceV2SchematicVectorConfigDto, ResourceV2SchematicVectorArrayConfigDto,
    ResourceV2SchematicTeamConfigDto, ResourceV2SchematicAccessConfigDto, ResourceV2SchematicUnitCommandConfigDto,
    ResourceV2SchematicColorConfigDto,
  ].map(type => ({ $ref: getSchemaPath(type) })), discriminator: { propertyName: 'type' } })
  @ValidateNested()
  @Type(() => ResourceV2SchematicConfigNoneDto, { discriminator: { property: 'type', subTypes: [
    { name: 'none', value: ResourceV2SchematicConfigNoneDto },
    { name: 'integer', value: ResourceV2SchematicIntegerConfigDto },
    { name: 'long', value: ResourceV2SchematicLongConfigDto },
    { name: 'float', value: ResourceV2SchematicFloatConfigDto },
    { name: 'double', value: ResourceV2SchematicDoubleConfigDto },
    { name: 'boolean', value: ResourceV2SchematicBooleanConfigDto },
    { name: 'text', value: ResourceV2SchematicTextConfigDto },
    { name: 'content', value: ResourceV2SchematicContentConfigDto },
    { name: 'tech_node', value: ResourceV2SchematicTechNodeConfigDto },
    { name: 'point', value: ResourceV2SchematicPointConfigDto },
    { name: 'point_array', value: ResourceV2SchematicPointArrayConfigDto },
    { name: 'int_seq', value: ResourceV2SchematicIntegerArrayConfigDto },
    { name: 'int_array', value: ResourceV2SchematicIntegerArrayConfigDto },
    { name: 'boolean_array', value: ResourceV2SchematicBooleanArrayConfigDto },
    { name: 'vec2', value: ResourceV2SchematicVectorConfigDto },
    { name: 'vec2_array', value: ResourceV2SchematicVectorArrayConfigDto },
    { name: 'team', value: ResourceV2SchematicTeamConfigDto },
    { name: 'l_access', value: ResourceV2SchematicAccessConfigDto },
    { name: 'unit_command', value: ResourceV2SchematicUnitCommandConfigDto },
    { name: 'color', value: ResourceV2SchematicColorConfigDto },
  ] }, keepDiscriminatorProperty: true })
  config!: ResourceV2SchematicConfigDtoUnion;
}

@ApiExtraModels(
  ResourceV2SchematicConfigNoneDto, ResourceV2SchematicIntegerConfigDto, ResourceV2SchematicLongConfigDto,
  ResourceV2SchematicFloatConfigDto, ResourceV2SchematicDoubleConfigDto, ResourceV2SchematicBooleanConfigDto,
  ResourceV2SchematicTextConfigDto, ResourceV2SchematicContentConfigDto, ResourceV2SchematicTechNodeConfigDto,
  ResourceV2SchematicPointConfigDto, ResourceV2SchematicPointArrayConfigDto, ResourceV2SchematicIntegerArrayConfigDto,
  ResourceV2SchematicBooleanArrayConfigDto, ResourceV2SchematicVectorConfigDto, ResourceV2SchematicVectorArrayConfigDto,
  ResourceV2SchematicTeamConfigDto, ResourceV2SchematicAccessConfigDto, ResourceV2SchematicUnitCommandConfigDto,
  ResourceV2SchematicColorConfigDto, ResourceV2SchematicConfigEditDto,
  ResourceV2SchematicPointPairDto, ResourceV2SchematicVectorPairDto,
)

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

  @ApiPropertyOptional({ type: [ResourceV2SchematicRotateDto], maxItems: 5_000, description: 'Rotate individual blocks whose configs do not contain coordinate links.' })
  @IsOptional() @IsArray() @ArrayMaxSize(5_000) @ValidateNested({ each: true }) @Type(() => ResourceV2SchematicRotateDto)
  rotate_positions?: ResourceV2SchematicRotateDto[];

  @ApiPropertyOptional({ type: [ResourceV2SchematicAddedBlockDto], maxItems: 5_000 })
  @IsOptional() @IsArray() @ArrayMaxSize(5_000) @ValidateNested({ each: true }) @Type(() => ResourceV2SchematicAddedBlockDto)
  add_blocks?: ResourceV2SchematicAddedBlockDto[];

  @ApiPropertyOptional({ type: [ResourceV2SchematicLogicConfigDto], maxItems: 1_000 })
  @IsOptional() @IsArray() @ArrayMaxSize(1_000) @ValidateNested({ each: true }) @Type(() => ResourceV2SchematicLogicConfigDto)
  logic_configs?: ResourceV2SchematicLogicConfigDto[];

  @ApiPropertyOptional({ type: [ResourceV2SchematicConfigEditDto], maxItems: 5_000, description: 'Discriminated v160.5 typed configuration edits. Unknown config types and unregistered per-block config classes are rejected.' })
  @IsOptional() @IsArray() @ArrayMaxSize(5_000) @ValidateNested({ each: true }) @Type(() => ResourceV2SchematicConfigEditDto)
  config_edits?: ResourceV2SchematicConfigEditDto[];
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

abstract class ResourceV2MapObjectOperationBaseDto {
  @ApiProperty({ enum: ['core', 'spawn', 'building'] })
  @IsIn(['core', 'spawn', 'building'])
  object_type!: 'core' | 'spawn' | 'building';
}

export class ResourceV2MapObjectAddDto extends ResourceV2MapObjectOperationBaseDto {
  @ApiProperty({ enum: ['add'] }) @Equals('add') action: 'add' = 'add';
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) x!: number;
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) y!: number;
  @ApiProperty({ maxLength: 191, example: 'core-shard' }) @IsString() @MinLength(1) @MaxLength(191) name!: string;
  @ApiPropertyOptional({ maxLength: 40, example: 'sharded', description: 'Required for core and building; omitted for spawn points.' })
  @IsOptional() @IsString() @MaxLength(40) team?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 3, default: 0 }) @IsOptional() @IsInt() @Min(0) @Max(3) rotation?: number;
}

export class ResourceV2MapObjectDeleteDto extends ResourceV2MapObjectOperationBaseDto {
  @ApiProperty({ enum: ['delete'] }) @Equals('delete') action: 'delete' = 'delete';
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) x!: number;
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) y!: number;
}

export class ResourceV2MapObjectMoveDto extends ResourceV2MapObjectOperationBaseDto {
  @ApiProperty({ enum: ['move'] }) @Equals('move') action: 'move' = 'move';
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) from_x!: number;
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) from_y!: number;
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) to_x!: number;
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) to_y!: number;
}

export class ResourceV2MapObjectRotateDto extends ResourceV2MapObjectOperationBaseDto {
  @ApiProperty({ enum: ['rotate'] }) @Equals('rotate') action: 'rotate' = 'rotate';
  @ApiProperty({ enum: ['core', 'building'] }) @IsIn(['core', 'building'])
  declare object_type: 'core' | 'building';
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) x!: number;
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) y!: number;
  @ApiProperty({ minimum: 0, maximum: 3 }) @IsInt() @Min(0) @Max(3) rotation!: number;
}

export class ResourceV2MapObjectTeamDto extends ResourceV2MapObjectOperationBaseDto {
  @ApiProperty({ enum: ['team'] }) @Equals('team') action: 'team' = 'team';
  @ApiProperty({ enum: ['core', 'building'] }) @IsIn(['core', 'building'])
  declare object_type: 'core' | 'building';
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) x!: number;
  @ApiProperty({ minimum: 0, maximum: 32_767 }) @IsInt() @Min(0) @Max(32_767) y!: number;
  @ApiProperty({ maxLength: 40, example: 'sharded' }) @IsString() @MinLength(1) @MaxLength(40) team!: string;
}

export type ResourceV2MapObjectOperationDtoUnion = ResourceV2MapObjectAddDto | ResourceV2MapObjectDeleteDto
  | ResourceV2MapObjectMoveDto | ResourceV2MapObjectTeamDto | ResourceV2MapObjectRotateDto;
export type ResourceV2MapObjectOperationInput =
  | { action: 'add'; object_type: 'core' | 'spawn' | 'building'; x: number; y: number; name: string; team?: string; rotation?: number }
  | { action: 'delete'; object_type: 'core' | 'spawn' | 'building'; x: number; y: number }
  | { action: 'move'; object_type: 'core' | 'spawn' | 'building'; from_x: number; from_y: number; to_x: number; to_y: number }
  | { action: 'team'; object_type: 'core' | 'building'; x: number; y: number; team: string }
  | { action: 'rotate'; object_type: 'core' | 'building'; x: number; y: number; rotation: number };

@ApiExtraModels(ResourceV2MapObjectAddDto, ResourceV2MapObjectDeleteDto, ResourceV2MapObjectMoveDto, ResourceV2MapObjectTeamDto, ResourceV2MapObjectRotateDto)
export class ResourceV2ExportMapDto {
  @ApiPropertyOptional({ type: [ResourceV2MapTerrainChangeDto], maxItems: 5_000 })
  @IsOptional() @IsArray() @ArrayMaxSize(5_000) @ValidateNested({ each: true }) @Type(() => ResourceV2MapTerrainChangeDto)
  terrain_changes?: ResourceV2MapTerrainChangeDto[];

  @ApiPropertyOptional({ type: 'object', description: 'Typed scalar/list Rules fields. Unspecified and unknown source fields are preserved.' })
  @IsOptional() @IsObject()
  rule_changes: Record<string, unknown> = {};

  @ApiPropertyOptional({ type: [ResourceV2MapWaveOperationDto], maxItems: 1_000 })
  @IsOptional() @IsArray() @ArrayMaxSize(1_000) @ValidateNested({ each: true }) @Type(() => ResourceV2MapWaveOperationDto)
  wave_operations?: ResourceV2MapWaveOperationDto[];

  @ApiPropertyOptional({ type: 'array', maxItems: 2_000, items: { oneOf: [
    { $ref: getSchemaPath(ResourceV2MapObjectAddDto) }, { $ref: getSchemaPath(ResourceV2MapObjectDeleteDto) },
    { $ref: getSchemaPath(ResourceV2MapObjectMoveDto) }, { $ref: getSchemaPath(ResourceV2MapObjectTeamDto) }, { $ref: getSchemaPath(ResourceV2MapObjectRotateDto) },
  ], discriminator: { propertyName: 'action', mapping: {
    add: getSchemaPath(ResourceV2MapObjectAddDto), delete: getSchemaPath(ResourceV2MapObjectDeleteDto),
    move: getSchemaPath(ResourceV2MapObjectMoveDto), team: getSchemaPath(ResourceV2MapObjectTeamDto), rotate: getSchemaPath(ResourceV2MapObjectRotateDto),
  } } } })
  @IsOptional() @IsArray() @ArrayMaxSize(2_000) @ValidateNested({ each: true })
  @Type(() => ResourceV2MapObjectAddDto, { discriminator: { property: 'action', subTypes: [
    { name: 'add', value: ResourceV2MapObjectAddDto }, { name: 'delete', value: ResourceV2MapObjectDeleteDto },
    { name: 'move', value: ResourceV2MapObjectMoveDto }, { name: 'team', value: ResourceV2MapObjectTeamDto },
    { name: 'rotate', value: ResourceV2MapObjectRotateDto },
  ] }, keepDiscriminatorProperty: true })
  object_operations?: ResourceV2MapObjectOperationDtoUnion[];
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
