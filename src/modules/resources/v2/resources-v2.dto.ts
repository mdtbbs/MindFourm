import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ResourceV2CursorDto {
  @ApiProperty({ nullable: true, type: String, example: 'eyJjcmVhdGVkX2F0IjoiMjAyNi0xMC0wNVQwMDowMDowMFoiLCJpZCI6MTAwfQ' })
  next_cursor!: string | null;

  @ApiProperty({ example: true })
  has_more!: boolean;
}

export class ResourceV2PageQueryDto {
  @ApiPropertyOptional({ maxLength: 1024, description: 'Opaque cursor returned by the previous page.' })
  @IsOptional() @IsString() @MaxLength(1024)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}

export class ResourceV2VersionQueryDto extends ResourceV2PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Select a published version by its public UUID; omitted selects the recommended/latest published version.' })
  @IsOptional() @IsUUID() @MaxLength(36)
  version_public_id?: string;
}

export class ResourceV2DependencyResolveQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Select a published version by its public UUID; omitted selects the recommended/latest published version.' })
  @IsOptional() @IsUUID() @MaxLength(36)
  version_public_id?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, default: 12, description: 'Maximum dependency tree depth.' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  max_depth?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 200, description: 'Maximum dependency nodes loaded and resolved.' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  max_nodes?: number;
}

export class ResourceV2ResolvedDependencyDto {
  @ApiProperty({ example: 'org.example.dependency' }) mod_id!: string;
  @ApiProperty({ nullable: true, type: String }) title!: string | null;
  @ApiProperty({ nullable: true, type: String }) version!: string | null;
  @ApiProperty({ enum: ['required', 'optional', 'incompatible', 'embedded'] }) kind!: string;
  @ApiProperty({ enum: ['resolved', 'unresolved', 'version_mismatch', 'embedded', 'cycle', 'limit_reached'] }) status!: string;
  @ApiProperty({ nullable: true, type: String }) constraint!: string | null;
  @ApiProperty({ type: [ResourceV2ResolvedDependencyDto] }) children!: ResourceV2ResolvedDependencyDto[];
}

export class ResourceV2DependencyResolutionDto {
  @ApiProperty({ example: 'org.example.root' }) root_mod_id!: string;
  @ApiProperty({ type: [ResourceV2ResolvedDependencyDto] }) direct!: ResourceV2ResolvedDependencyDto[];
  @ApiProperty({ type: [ResourceV2ResolvedDependencyDto] }) tree!: ResourceV2ResolvedDependencyDto[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) unresolved!: Array<Record<string, unknown>>;
  @ApiProperty({ type: 'array', items: { type: 'array', items: { type: 'string' } } }) cycles!: string[][];
  @ApiProperty({ type: [String] }) warnings!: string[];
  @ApiProperty() truncated!: boolean;
}

export class ResourceV2DiffQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Source version public UUID. If omitted, the previous published version is selected.' })
  @IsOptional() @IsUUID() @MaxLength(36)
  from_version_public_id?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Target version public UUID. If omitted, the recommended/latest published version is selected.' })
  @IsOptional() @IsUUID() @MaxLength(36)
  to_version_public_id?: string;
}

export class ResourceV2ContentSearchQueryDto extends ResourceV2PageQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 255, example: 'conveyor' })
  @IsString() @IsNotEmpty() @MaxLength(255)
  q!: string;

  @ApiPropertyOptional({ maxLength: 50, example: 'block', description: 'Optional Mindustry content type, such as block, item, unit, or liquid.' })
  @IsOptional() @IsString() @MaxLength(50)
  type?: string;
}

export class ResourceV2PublicResourceDto {
  @ApiProperty({ format: 'uuid', example: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240' })
  public_id!: string;

  @ApiProperty({ enum: ['mod', 'schematic', 'map', 'other'] })
  resource_kind!: string;

  @ApiProperty({ example: 'Example Resource' })
  title!: string;

  @ApiProperty({ nullable: true, type: String, example: 'A short public summary.' })
  summary!: string | null;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ nullable: true, type: String })
  content!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'uri', example: 'https://github.com/example/mod' })
  source_url!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'MIT' })
  license!: string | null;

  @ApiProperty({ enum: ['tiptap_json'] })
  content_format!: 'tiptap_json';

  @ApiProperty({ example: 2 })
  content_schema_version!: number;

  @ApiProperty({ nullable: true, type: 'object' })
  content_json!: Record<string, unknown> | null;

  @ApiProperty({ nullable: true, type: String })
  content_html!: string | null;

  @ApiProperty({ nullable: true, type: String })
  content_text!: string | null;

  @ApiProperty({ enum: ['public', 'unlisted', 'private'] })
  visibility!: string;

  @ApiProperty({ type: 'object', description: 'Allowlisted public projection of parsed metadata. Private storage and raw metadata fields are omitted.' })
  metadata!: Record<string, unknown>;

  @ApiProperty({ type: 'object', nullable: true, description: 'Public renderer state and allowlisted parsed metadata; never includes storage keys or private error details.' })
  renderer!: ResourceV2RendererDto | null;
}

export class ResourceV2RendererDto {
  @ApiProperty({ enum: ['processing', 'ready', 'failed', 'unavailable', 'none'] })
  status!: string;

  @ApiProperty({ nullable: true, type: String })
  parser_version!: string | null;

  @ApiProperty({ nullable: true, type: 'object' })
  public_metadata!: Record<string, unknown> | null;

  @ApiProperty({ nullable: true, type: String, example: '/api/v1/resources/4ab5d671-8af6-4d16-8238-7b6fd4b0a240/preview' })
  preview_url!: string | null;
}

export class ResourceV2CompatibilityDto {
  @ApiProperty({ example: 'mindustry' })
  runtime!: string;

  @ApiProperty({ nullable: true, type: String, example: 'v7' })
  game_version!: string | null;

  @ApiProperty({ nullable: true, type: String })
  min_game_version!: string | null;

  @ApiProperty({ nullable: true, type: String })
  max_game_version!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'desktop' })
  platform!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'verified' })
  status!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'file_metadata' })
  source!: string | null;

  @ApiProperty({ nullable: true, type: String, enum: ['low', 'medium', 'high'] })
  confidence!: string | null;

  @ApiProperty({ nullable: true, type: String })
  channel!: string | null;

  @ApiProperty({ nullable: true, type: String })
  notes!: string | null;
}

export class ResourceV2DependencyDto {
  @ApiProperty({ example: 'required' })
  dependency_type!: string;

  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  resource_public_id!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'examplemod' })
  external_identifier!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'uri' })
  upstream_url!: string | null;

  @ApiProperty({ nullable: true, type: String, example: '^1.2.0' })
  version_constraint!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'resolved' })
  resolution_status!: string | null;

  @ApiProperty({ example: 0 })
  sort_order!: number;
}

export class ResourceV2FileDto {
  @ApiProperty({ format: 'uuid', example: 'ff735042-c847-4a9d-95c4-150770949312' })
  public_id!: string;

  @ApiProperty({ example: 'primary' }) role!: string;
  @ApiProperty({ example: 'managed' }) delivery_mode!: string;
  @ApiProperty({ nullable: true, type: String }) platform!: string | null;
  @ApiProperty({ nullable: true, type: String }) architecture!: string | null;
  @ApiProperty({ nullable: true, type: String }) package_type!: string | null;
  @ApiProperty({ nullable: true, type: String }) display_name!: string | null;
  @ApiProperty({ nullable: true, type: String }) original_filename!: string | null;
  @ApiProperty({ nullable: true, type: String }) mime_type!: string | null;
  @ApiProperty({ nullable: true, type: Number }) size_bytes!: number | null;

  @ApiProperty({ nullable: true, type: String, example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' })
  sha256!: string | null;

  @ApiProperty({ example: 'verified' }) integrity_status!: string;
  @ApiProperty({ example: 'available' }) availability_status!: string;
  @ApiProperty({ example: true }) downloadable!: boolean;
  @ApiProperty({ example: true }) installable!: boolean;
  @ApiProperty({ example: '/api/v1/resources/4ab5d671-8af6-4d16-8238-7b6fd4b0a240/versions/84b37577-d086-4897-a866-658e29e0bd09/files/ff735042-c847-4a9d-95c4-150770949312/download' })
  download_url!: string;
}

export class ResourceV2VersionDto {
  @ApiProperty({ format: 'uuid', example: '84b37577-d086-4897-a866-658e29e0bd09' })
  public_id!: string;

  @ApiProperty({ example: '1.2.0' }) version!: string;
  @ApiProperty({ example: '1.2.0' }) display_version!: string;
  @ApiProperty({ enum: ['semver', 'compatibility'] }) version_mode!: string;
  @ApiProperty({ minimum: 1, example: 1 }) revision!: number;
  @ApiProperty({ enum: ['release', 'beta', 'alpha', 'snapshot', 'stable'] }) release_channel!: string;
  @ApiProperty({ example: true }) recommended!: boolean;
  @ApiProperty({ nullable: true, type: String }) game_version_min!: string | null;
  @ApiProperty({ nullable: true, type: String }) game_version_max!: string | null;
  @ApiProperty({ example: 'published' }) status!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) published_at!: string | null;
  @ApiProperty({ nullable: true, type: String, example: '/api/v1/resources/4ab5d671-8af6-4d16-8238-7b6fd4b0a240/versions/84b37577-d086-4897-a866-658e29e0bd09/preview' })
  preview_url!: string | null;
  @ApiProperty({ type: [ResourceV2CompatibilityDto] }) compatibility!: ResourceV2CompatibilityDto[];
  @ApiProperty({ type: [ResourceV2DependencyDto] }) dependencies!: ResourceV2DependencyDto[];
  @ApiProperty({ type: [ResourceV2FileDto] }) files!: ResourceV2FileDto[];
}

export class ResourceV2PageDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  items!: unknown[];

  @ApiProperty({ type: ResourceV2CursorDto })
  pagination!: ResourceV2CursorDto;
}

export class ResourceV2VersionPageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2VersionDto] })
  declare items: ResourceV2VersionDto[];
}

export class ResourceV2ResourceRefDto {
  @ApiProperty({ format: 'uuid' }) public_id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['mod', 'schematic', 'map', 'other'] }) resource_kind!: string;
}

export class ResourceV2RelationDto {
  @ApiProperty({ example: 'requires' }) relation_type!: string;
  @ApiProperty({ enum: ['outgoing', 'incoming'], description: 'Whether the current resource is the source or target of this relation.' })
  relation_direction!: 'outgoing' | 'incoming';
  @ApiProperty({ enum: ['opening', 'production', 'defense', 'logistics', 'general'], example: 'production' })
  relation_context!: 'opening' | 'production' | 'defense' | 'logistics' | 'general';
  @ApiProperty({ type: ResourceV2ResourceRefDto }) resource!: ResourceV2ResourceRefDto;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) version_public_id!: string | null;
  @ApiProperty({ nullable: true, type: String, example: '1.4.2', description: 'Published version label for the related resource, when a relation targets a specific version.' })
  version!: string | null;
}

export class ResourceV2RelationPageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2RelationDto] })
  declare items: ResourceV2RelationDto[];
}

export class ResourceV2StatsDto {
  @ApiProperty({ example: 180 }) views!: number;
  @ApiProperty({ example: 42 }) downloads!: number;
  @ApiProperty({ example: 13 }) likes!: number;
  @ApiProperty({ example: 7 }) favorites!: number;
  @ApiProperty({ example: 4 }) rating_count!: number;
  @ApiProperty({ example: 4.5 }) rating_average!: number;
}

export class ResourceV2ManifestDto {
  @ApiProperty({ example: 2 }) schema_version!: 2;
  @ApiProperty({ type: ResourceV2PublicResourceDto }) resource!: ResourceV2PublicResourceDto;
  @ApiProperty({ type: ResourceV2VersionDto, nullable: true }) recommended_version!: ResourceV2VersionDto | null;
  @ApiProperty({ type: [ResourceV2VersionDto] }) versions!: ResourceV2VersionDto[];
  @ApiProperty({ type: [ResourceV2RelationDto] }) relations!: ResourceV2RelationDto[];
  @ApiProperty({ type: ResourceV2StatsDto }) stats!: ResourceV2StatsDto;
  @ApiProperty({ nullable: true, type: 'object', description: 'Kind-specific manifest summary. Null when no structured analysis has been produced.' })
  kind_summary!: Record<string, unknown> | null;
}

export class ResourceV2ModProfileDto {
  @ApiProperty({ nullable: true, type: String }) mod_id!: string | null;
  @ApiProperty({ nullable: true, type: String }) display_name!: string | null;
  @ApiProperty({ nullable: true, type: String, enum: ['Java', 'JS', 'Hybrid', 'Content'] }) runtime_type!: string | null;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ type: [String] }) aliases!: string[];
}

export class ResourceV2ModDetailDto {
  @ApiProperty({ type: ResourceV2PublicResourceDto }) resource!: ResourceV2PublicResourceDto;
  @ApiProperty({ type: ResourceV2ModProfileDto }) profile!: ResourceV2ModProfileDto;
  @ApiProperty({ type: ResourceV2StatsDto }) stats!: ResourceV2StatsDto;
}

export class ResourceV2SchematicMetadataDto {
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: Number }) block_count!: number | null;
  @ApiProperty({ nullable: true, type: Number }) min_supported_build!: number | null;
  @ApiProperty({ nullable: true, type: Number }) schematic_format_version!: number | null;
  @ApiProperty({ nullable: true, type: String }) parser_version!: string | null;
  @ApiProperty({ type: [String] }) dependencies!: string[];
}

export class ResourceV2SchematicDetailDto {
  @ApiProperty({ type: ResourceV2PublicResourceDto }) resource!: ResourceV2PublicResourceDto;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) version_public_id!: string | null;
  @ApiProperty({ type: ResourceV2SchematicMetadataDto }) schematic!: ResourceV2SchematicMetadataDto;
  @ApiProperty({ type: ResourceV2StatsDto }) stats!: ResourceV2StatsDto;
}

export class ResourceV2MapMetadataDto {
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: String }) game_mode!: string | null;
  @ApiProperty({ type: [String] }) game_modes!: string[];
  @ApiProperty({ nullable: true, type: String }) planet!: string | null;
  @ApiProperty({ nullable: true, type: Number }) player_count!: number | null;
  @ApiProperty({ nullable: true, type: Number }) playtime_seconds!: number | null;
  @ApiProperty({ nullable: true, type: String }) game_version_min!: string | null;
  @ApiProperty({ nullable: true, type: String }) game_version_max!: string | null;
  @ApiProperty({ nullable: true, type: String }) parser_version!: string | null;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) cores!: Array<Record<string, unknown>>;
}

export class ResourceV2MapDetailDto {
  @ApiProperty({ type: ResourceV2PublicResourceDto }) resource!: ResourceV2PublicResourceDto;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) version_public_id!: string | null;
  @ApiProperty({ type: ResourceV2MapMetadataDto }) map!: ResourceV2MapMetadataDto;
  @ApiProperty({ type: ResourceV2StatsDto }) stats!: ResourceV2StatsDto;
}

export class ResourceV2ContentDto {
  @ApiProperty({ format: 'uuid', example: 'cf1e47d0-a94a-4a08-aa49-3671e15cf57a' }) public_id!: string;
  @ApiProperty({ example: 'block' }) content_type!: string;
  @ApiProperty({ example: 'example-conveyor' }) internal_name!: string;
  @ApiProperty({ nullable: true, type: String }) display_name!: string | null;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) icon_url!: string | null;
  @ApiProperty({ type: 'object' }) properties!: Record<string, unknown>;
  @ApiProperty({ type: ResourceV2ResourceRefDto }) resource!: ResourceV2ResourceRefDto;
  @ApiProperty({ format: 'uuid' }) version_public_id!: string;
}

export class ResourceV2ContentPageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2ContentDto] }) declare items: ResourceV2ContentDto[];
}

export class ResourceV2LocalizationDto {
  @ApiProperty({ example: 'zh_CN' }) locale!: string;
  @ApiProperty({ example: 84 }) translated_count!: number;
  @ApiProperty({ example: 100 }) total_count!: number;
  @ApiProperty({ example: 84 }) percentage!: number;
  @ApiProperty({ type: [String] }) missing_keys!: string[];
}

export class ResourceV2LocalizationPageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2LocalizationDto] }) declare items: ResourceV2LocalizationDto[];
}

export class ResourceV2AnalysisFindingDto {
  @ApiProperty({ example: 'missing-dependency' }) key!: string;
  @ApiProperty({ enum: ['ERROR', 'WARNING', 'INFO'] }) severity!: 'ERROR' | 'WARNING' | 'INFO';
  @ApiProperty({ example: 'A required dependency is unresolved.' }) message!: string;
  @ApiProperty({ nullable: true, type: String }) field_path!: string | null;
  @ApiProperty({ example: false }) ignored!: boolean;
  @ApiProperty({ nullable: true, type: String }) ignore_reason!: string | null;
  @ApiProperty({ nullable: true, type: String }) actor!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) timestamp!: string | null;
}

export class ResourceV2AnalysisDto {
  @ApiProperty({ enum: ['mod', 'schematic', 'map'] }) kind!: string;
  @ApiProperty({ example: 'completed' }) status!: string;
  @ApiProperty({ nullable: true, type: String }) parser_version!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) started_at!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) completed_at!: string | null;
  @ApiProperty({ nullable: true, type: 'object' }) summary!: Record<string, unknown> | null;
  @ApiProperty({ type: [ResourceV2AnalysisFindingDto] }) findings!: ResourceV2AnalysisFindingDto[];
  @ApiProperty({ nullable: true, type: 'object' }) data!: Record<string, unknown> | null;
}

export class ResourceV2AnalysisResponseDto {
  @ApiProperty({ type: ResourceV2AnalysisDto, nullable: true, description: 'Null until an analysis run has completed.' })
  analysis!: ResourceV2AnalysisDto | null;
}

export class ResourceV2ModCompatibilityReportDto {
  @ApiProperty({ format: 'uuid' }) public_id!: string;
  @ApiProperty({ example: 'verified' }) status!: string;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) version_public_id!: string | null;
  @ApiProperty({ nullable: true, type: String }) game_version!: string | null;
  @ApiProperty({ nullable: true, type: String }) platform!: string | null;
  @ApiProperty({ nullable: true, type: String }) runtime!: string | null;
  @ApiProperty({ nullable: true, type: String }) body!: string | null;
  @ApiProperty({ nullable: true, type: String }) author_response!: string | null;
}

export class ResourceV2CompatibilityResponseDto {
  @ApiProperty({ type: [ResourceV2CompatibilityDto] }) items!: ResourceV2CompatibilityDto[];
  @ApiProperty({ type: [ResourceV2ModCompatibilityReportDto] }) reports!: ResourceV2ModCompatibilityReportDto[];
}

export class ResourceV2ConflictDto {
  @ApiProperty({ format: 'uuid' }) public_id!: string;
  @ApiProperty({ example: 'verified' }) status!: string;
  @ApiProperty({ nullable: true, type: String }) title!: string | null;
  @ApiProperty({ nullable: true, type: String }) body!: string | null;
  @ApiProperty({ type: [ResourceV2ResourceRefDto] }) members!: ResourceV2ResourceRefDto[];
  @ApiProperty({ nullable: true, type: String }) author_response!: string | null;
}

export class ResourceV2ConflictPageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2ConflictDto] }) declare items: ResourceV2ConflictDto[];
}

export class ResourceV2IssueReportDto {
  @ApiProperty({ format: 'uuid' }) public_id!: string;
  @ApiProperty({ format: 'uuid' }) version_public_id!: string;
  @ApiProperty({ example: 'open' }) status!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ nullable: true, type: String }) author_response_status!: string | null;
  @ApiProperty({ nullable: true, type: String }) author_response!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) fixed_version_public_id!: string | null;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
}

export class ResourceV2IssueReportPageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2IssueReportDto] }) declare items: ResourceV2IssueReportDto[];
}

export class ResourceV2ResolveModDto {
  @ApiProperty({ example: 'org.example.mod' }) requested_mod_id!: string;
  @ApiProperty({ example: 'org.example.mod' }) canonical_mod_id!: string;
  @ApiProperty({ type: ResourceV2PublicResourceDto }) resource!: ResourceV2PublicResourceDto;
  @ApiProperty({ type: [String] }) aliases!: string[];
}

export class ResourceV2BlockDto {
  @ApiProperty({ example: 'conveyor' }) internal_name!: string;
  @ApiProperty({ nullable: true, type: String }) display_name!: string | null;
  @ApiProperty({ example: 24 }) count!: number;
  @ApiProperty({ nullable: true, type: Number }) x!: number | null;
  @ApiProperty({ nullable: true, type: Number }) y!: number | null;
  @ApiProperty({ nullable: true, type: Number }) rotation!: number | null;
  @ApiProperty({ nullable: true, type: Number }) team!: number | null;
  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'Parsed grid positions; empty if the source did not retain them.' })
  positions!: Array<Record<string, unknown>>;
  @ApiProperty({ type: 'object' }) properties!: Record<string, unknown>;
}

export class ResourceV2BlockPageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2BlockDto] }) declare items: ResourceV2BlockDto[];
}

export class ResourceV2MaterialDto {
  @ApiProperty({ example: 'copper' }) internal_name!: string;
  @ApiProperty({ example: 250 }) amount!: number;
  @ApiProperty({ nullable: true, type: String }) display_name!: string | null;
}

export class ResourceV2MaterialPageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2MaterialDto] }) declare items: ResourceV2MaterialDto[];
}

export class ResourceV2LogicProcessorDto {
  @ApiProperty({ example: 12 }) x!: number;
  @ApiProperty({ example: 8 }) y!: number;
  @ApiProperty({ example: 'micro' }) processor_type!: string;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) links!: Record<string, unknown>[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) variables!: Record<string, unknown>[];
}

export class ResourceV2LogicPageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2LogicProcessorDto] }) declare items: ResourceV2LogicProcessorDto[];
}

export class ResourceV2ProductionResponseDto {
  @ApiProperty({ example: true }) available!: boolean;
  @ApiProperty({ type: 'object', nullable: true, description: 'Theoretical production data; null when the parser has not produced a result.' })
  production!: Record<string, unknown> | null;
}

export class ResourceV2MapRulesDto {
  @ApiProperty({ format: 'uuid', nullable: true }) version_public_id!: string | null;
  @ApiProperty({ type: 'object', nullable: true }) rules!: Record<string, unknown> | null;
}

export class ResourceV2MapResourceDto {
  @ApiProperty({ example: 'item' }) resource_type!: string;
  @ApiProperty({ example: 'copper' }) internal_name!: string;
  @ApiProperty({ example: 1200 }) amount!: number;
  @ApiProperty({ type: 'object', nullable: true }) distribution!: Record<string, unknown> | null;
}

export class ResourceV2MapResourcePageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2MapResourceDto] }) declare items: ResourceV2MapResourceDto[];
}

export class ResourceV2SpawnDto {
  @ApiProperty({ example: 'enemy' }) spawn_type!: string;
  @ApiProperty({ nullable: true, type: Number }) team!: number | null;
  @ApiProperty({ example: 48 }) x!: number;
  @ApiProperty({ example: 64 }) y!: number;
  @ApiProperty({ nullable: true, type: Number }) wave!: number | null;
}

export class ResourceV2SpawnPageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2SpawnDto] }) declare items: ResourceV2SpawnDto[];
}

export class ResourceV2WaveSummaryDto {
  @ApiProperty({ example: 1 }) wave_start!: number;
  @ApiProperty({ example: 5 }) wave_end!: number;
  @ApiProperty({ example: 24 }) enemy_count!: number;
  @ApiProperty({ nullable: true, type: Number }) estimated_health!: number | null;
  @ApiProperty({ nullable: true, type: Number }) air_ratio!: number | null;
  @ApiProperty({ example: 0 }) boss_count!: number;
  @ApiProperty({ nullable: true, type: Number }) strength!: number | null;
  @ApiProperty({ example: false }) is_spike!: boolean;
}

export class ResourceV2WavePageDto extends ResourceV2PageDto {
  @ApiProperty({ type: [ResourceV2WaveSummaryDto] }) declare items: ResourceV2WaveSummaryDto[];
}

export class ResourceV2DiffDto {
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) from_version_public_id!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) to_version_public_id!: string | null;
  @ApiProperty({ example: 'ready' }) status!: string;
  @ApiProperty({ nullable: true, type: String }) parser_version!: string | null;
  @ApiProperty({ nullable: true, type: 'object', description: 'Null when no stored diff exists for this version pair.' }) diff!: Record<string, unknown> | null;
}

export class ResourceV2WorkbenchPermissionsDto {
  @ApiProperty({ enum: ['owner', 'maintainer', 'publisher', 'admin', 'viewer'], nullable: true })
  role!: string | null;

  @ApiProperty({ example: false }) can_manage!: boolean;
}

export class ResourceWorkbenchV2Dto {
  @ApiProperty({ type: ResourceV2PublicResourceDto }) resource!: ResourceV2PublicResourceDto;
  @ApiProperty({ type: ResourceV2WorkbenchPermissionsDto }) permissions!: ResourceV2WorkbenchPermissionsDto;
  @ApiProperty({ type: [ResourceV2VersionDto] }) versions!: ResourceV2VersionDto[];
  @ApiProperty({ type: ResourceV2AnalysisDto, nullable: true }) analysis!: ResourceV2AnalysisDto | null;
  @ApiProperty({ type: [ResourceV2RelationDto] }) relations!: ResourceV2RelationDto[];
  @ApiProperty({ type: ResourceV2StatsDto }) stats!: ResourceV2StatsDto;
}

export class ResourceV2ApiMetaDto {
  @ApiProperty({ example: 'req_01J9XZ4B9Y4Y8V1JXK5Z7Q0W12' }) request_id!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) next_cursor?: string | null;
  @ApiPropertyOptional({ type: 'object' }) pagination?: Record<string, unknown>;
}

export class ResourceV2ApiErrorDto {
  @ApiProperty({ example: 'RESOURCE_NOT_FOUND' }) code!: string;
  @ApiProperty({ example: '资源不存在或不可见' }) message!: string;
  @ApiProperty({ example: false }) retryable!: boolean;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) details!: unknown[];
  @ApiProperty({ format: 'uri', example: 'https://mdtbbs.cn/api/v1/docs/errors#resource-not-found' }) documentation_url!: string;
}

export class ResourceV2ApiErrorEnvelopeDto {
  @ApiProperty({ type: ResourceV2ApiErrorDto }) error!: ResourceV2ApiErrorDto;
  @ApiProperty({ type: ResourceV2ApiMetaDto }) meta!: ResourceV2ApiMetaDto;
}

export class ResourceV2EnvelopeDto<T = unknown> {
  @ApiProperty({ type: 'object' }) data!: T;
  @ApiProperty({ type: ResourceV2ApiMetaDto }) meta!: ResourceV2ApiMetaDto;
}
