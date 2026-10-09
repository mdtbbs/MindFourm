import { ApiExtraModels, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ResourceDiscoveryUserDto {
  @ApiProperty() id!: number;
  @ApiProperty() username!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) avatar_url?: string | null;
  @ApiProperty() role!: string;
}

export class ResourceDiscoveryRendererSummaryDto {
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: Number }) build!: number | null;
}

/** Card projection returned by toPublicResource(resource, true). */
export class ResourceDiscoveryResourceCardDto {
  @ApiPropertyOptional() id?: number;
  @ApiProperty({ format: 'uuid' }) public_id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) slug!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) user_id?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) category_id?: number | null;
  @ApiProperty({ nullable: true, type: String }) resource_kind!: string | null;
  @ApiProperty({ nullable: true, type: String }) resource_type!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) version?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) content_language?: string | null;
  @ApiProperty({ enum: ['approved', 'published'] }) status!: string;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) visibility!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) file_name?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) mime_type?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) content_hash?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) renderer_status?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) renderer_error_code?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) renderer_parser_version?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'uri' }) external_url?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'uri' }) homepage_url?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'uri' }) source_url?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) license?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) origin_site?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) origin_resource_id?: number | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'uri' }) origin_url?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) latest_published_version_id?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) discussion_thread_id?: number | null;
  @ApiProperty() is_public!: boolean;
  @ApiProperty() use_mfl!: boolean;
  @ApiProperty() is_featured!: number;
  @ApiProperty() view_count!: number;
  @ApiProperty() download_count!: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) favorite_count?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) like_count?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Boolean }) is_favorited?: boolean | null;
  @ApiPropertyOptional({ nullable: true, type: Boolean }) is_liked?: boolean | null;
  @ApiPropertyOptional({ nullable: true, type: Boolean }) is_subscribed?: boolean | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) trending_score?: number | null;
  @ApiProperty() rating_count!: number;
  @ApiProperty() rating_sum!: number;
  @ApiProperty() rating_average!: number;
  @ApiProperty() comment_count!: number;
  @ApiProperty() file_size!: number;
  @ApiProperty() username!: string;
  @ApiProperty({ nullable: true, type: String }) avatar_url!: string | null;
  @ApiProperty({ nullable: true, type: String }) category_name!: string | null;
  @ApiProperty({ nullable: true, type: String }) category_icon!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) metadata!: Record<string, unknown>;
  @ApiProperty({ type: ResourceDiscoveryRendererSummaryDto }) renderer_summary!: ResourceDiscoveryRendererSummaryDto;
  @ApiProperty({ nullable: true, type: String }) preview_url!: string | null;
  @ApiProperty({ nullable: true, type: ResourceDiscoveryUserDto }) user!: ResourceDiscoveryUserDto | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) created_at!: Date | string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String, description: 'Operational write timestamp; moved by unrelated writes such as view and download counting. Do not present this as the publication date.' }) updated_at!: Date | string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String, description: 'When the resource first became publicly visible. This is the author-facing date.' }) published_at!: Date | string | null;
}

export class ResourceDiscoveryQueryDto {
  @ApiPropertyOptional({ enum: ['mod', 'schematic', 'map', 'other'], description: 'Optional resource kind filter.' })
  @IsOptional() @IsIn(['mod', 'schematic', 'map', 'other'])
  kind?: 'mod' | 'schematic' | 'map' | 'other';

  @ApiPropertyOptional({ minimum: 1, maximum: 30, default: 8 })
  @Type(() => Number)
  @IsOptional() @IsInt() @Min(1) @Max(30)
  limit = 8;

  @ApiPropertyOptional({ minimum: 1, maximum: 400, default: 1, description: 'One-based page over the bounded ranking candidate window.' })
  @Type(() => Number)
  @IsOptional() @IsInt() @Min(1) @Max(400)
  page = 1;
}

export class ResourceDiscoveryHomeQueryDto extends ResourceDiscoveryQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 8, description: 'Maximum number of results per home section.' })
  @Type(() => Number)
  @IsOptional() @IsInt() @Min(1) @Max(20)
  limit = 8;
}

export class ResourceDiscoveryPageQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 30, default: 8 })
  @Type(() => Number)
  @IsOptional() @IsInt() @Min(1) @Max(30)
  limit = 8;

  @ApiPropertyOptional({ minimum: 1, maximum: 400, default: 1, description: 'One-based page over the bounded ranking candidate window.' })
  @Type(() => Number)
  @IsOptional() @IsInt() @Min(1) @Max(400)
  page = 1;
}

export class ResourceDiscoveryRelatedQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 24, default: 8 })
  @Type(() => Number)
  @IsOptional() @IsInt() @Min(1) @Max(24)
  limit = 8;

  @ApiPropertyOptional({ minimum: 1, maximum: 400, default: 1, description: 'One-based page over the bounded ranking candidate window.' })
  @Type(() => Number)
  @IsOptional() @IsInt() @Min(1) @Max(400)
  page = 1;
}

export class ResourceDiscoveryHotQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 30, default: 10 })
  @Type(() => Number)
  @IsOptional() @IsInt() @Min(1) @Max(30)
  limit = 10;

  @ApiPropertyOptional({ minimum: 1, maximum: 400, default: 1, description: 'One-based page over the bounded download ranking candidate window.' })
  @Type(() => Number)
  @IsOptional() @IsInt() @Min(1) @Max(400)
  page = 1;
}

export class ResourceDiscoveryHomePaginationDto {
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ minimum: 1, maximum: 20 }) limit!: number;
  @ApiProperty({ description: 'Number of ranked entries available in this bounded candidate window.' }) items_in_window!: number;
  @ApiProperty({ description: 'Whether another page is available within the current candidate window.' }) more_in_window!: boolean;
  @ApiProperty({ description: 'Maximum number of candidates considered by this ranking query.' }) candidate_window_size!: number;
  @ApiProperty({ description: 'True when the source query hit its candidate cap; further candidates may exist.' }) candidate_window_truncated!: boolean;
}

export class ResourceDiscoveryForYouPaginationDto {
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ minimum: 1, maximum: 30 }) limit!: number;
  @ApiProperty({ description: 'Number of ranked entries available in this bounded candidate window.' }) items_in_window!: number;
  @ApiProperty({ description: 'Whether another page is available within the current candidate window.' }) more_in_window!: boolean;
  @ApiProperty({ description: 'Maximum number of candidates considered by this ranking query.' }) candidate_window_size!: number;
  @ApiProperty({ description: 'True when the source query hit its candidate cap; further candidates may exist.' }) candidate_window_truncated!: boolean;
}

export class ResourceDiscoveryRelatedPaginationDto {
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ minimum: 1, maximum: 24 }) limit!: number;
  @ApiProperty({ description: 'Number of ranked entries available in this bounded candidate window.' }) items_in_window!: number;
  @ApiProperty({ description: 'Whether another page is available within the current candidate window.' }) more_in_window!: boolean;
  @ApiProperty({ description: 'Maximum number of candidates considered by this ranking query.' }) candidate_window_size!: number;
  @ApiProperty({ description: 'True when the source query hit its candidate cap; further candidates may exist.' }) candidate_window_truncated!: boolean;
}

export class ResourceDiscoveryItemDto {
  @ApiProperty({ type: ResourceDiscoveryResourceCardDto }) resource!: ResourceDiscoveryResourceCardDto;
  @ApiProperty({ description: 'Ranking score rounded to three decimals. Compare only within the same algorithm identifier; this is not a quality guarantee.' }) score!: number;
  @ApiProperty({ type: [String], example: ['same_kind', 'same_category', 'shared_tags:logic,power', 'kind:schematic', 'tags:logic,power', 'recent_downloads', 'editor_pick', 'top_downloaded'], description: 'Stable reason codes: editor_pick, trending, recent_views, recent_downloads, quality_signals, top_rated, newest, top_downloaded, same_kind, same_category, shared_tags:<tags>, kind:<kind>, category, tags:<tags>, featured, popular_now.' }) reasons!: string[];
  @ApiPropertyOptional({ description: 'Views during the last seven days; present for rising results.' }) recent_views?: number;
  @ApiPropertyOptional({ description: 'Completed downloads during the last seven days; present for rising results.' }) recent_downloads?: number;
}

export class ResourceDiscoverySectionDto {
  @ApiProperty({ type: [ResourceDiscoveryItemDto] }) items!: ResourceDiscoveryItemDto[];
  @ApiProperty({ type: ResourceDiscoveryHomePaginationDto }) pagination!: ResourceDiscoveryHomePaginationDto;
}

export class ResourceDiscoveryFeaturedSectionDto extends ResourceDiscoverySectionDto {
  @ApiProperty({ enum: ['resource-featured-v1'], example: 'resource-featured-v1', description: 'Versioned ranking algorithm. Formula and input definitions are published in /api/v1/docs/resources.' }) algorithm!: string;
}

export class ResourceDiscoveryTrendingSectionDto extends ResourceDiscoverySectionDto {
  @ApiProperty({ enum: ['resource-trending-v1'], example: 'resource-trending-v1', description: 'Versioned ranking algorithm. Formula and input definitions are published in /api/v1/docs/resources.' }) algorithm!: string;
}

export class ResourceDiscoveryRisingSectionDto extends ResourceDiscoverySectionDto {
  @ApiProperty({ enum: ['resource-rising-v1'], example: 'resource-rising-v1', description: 'Versioned ranking algorithm. Formula and input definitions are published in /api/v1/docs/resources.' }) algorithm!: string;
}

export class ResourceDiscoveryTopRatedSectionDto extends ResourceDiscoverySectionDto {
  @ApiProperty({ enum: ['resource-bayesian-rating-v1'], example: 'resource-bayesian-rating-v1', description: 'Versioned ranking algorithm. Formula and input definitions are published in /api/v1/docs/resources.' }) algorithm!: string;
}

export class ResourceDiscoveryNewestSectionDto extends ResourceDiscoverySectionDto {
  @ApiProperty({ enum: ['resource-newest-v1'], example: 'resource-newest-v1', description: 'Versioned ranking algorithm. Formula and input definitions are published in /api/v1/docs/resources.' }) algorithm!: string;
}

export class ResourceDiscoveryHomeSectionsDto {
  @ApiProperty({ type: ResourceDiscoveryFeaturedSectionDto, description: 'Featured resources ranked by popularity.' }) featured!: ResourceDiscoveryFeaturedSectionDto;
  @ApiProperty({ type: ResourceDiscoveryTrendingSectionDto, description: 'Resources ranked by quality signals plus an update-recency bonus.' }) trending!: ResourceDiscoveryTrendingSectionDto;
  @ApiProperty({ type: ResourceDiscoveryRisingSectionDto, description: 'Resources ranked by quality plus seven-day view and completed-download signals.' }) rising!: ResourceDiscoveryRisingSectionDto;
  @ApiProperty({ type: ResourceDiscoveryTopRatedSectionDto, description: 'Rated resources ranked by Bayesian-smoothed rating.' }) top_rated!: ResourceDiscoveryTopRatedSectionDto;
  @ApiProperty({ type: ResourceDiscoveryNewestSectionDto, description: 'Newest currently visible resources.' }) newest!: ResourceDiscoveryNewestSectionDto;
}

export class ResourceDiscoveryHomeDto {
  @ApiProperty({ format: 'date-time' }) generated_at!: string;
  @ApiProperty({ type: ResourceDiscoveryHomeSectionsDto }) sections!: ResourceDiscoveryHomeSectionsDto;
}

export class ResourceDiscoveryRecommendationsDto {
  @ApiProperty({ enum: ['resource-taste-v1', 'resource-trending-v1'], example: 'resource-taste-v1', description: 'Personalized taste ranking or the non-personalized trending fallback.' }) algorithm!: string;
  @ApiProperty({ description: 'True only when currently visible in-site likes/favorites produced a profile.' }) personalized!: boolean;
  @ApiProperty({ description: 'Explains whether a personal profile was used and its data boundary.' }) privacy!: string;
  @ApiProperty({ type: [ResourceDiscoveryItemDto] }) items!: ResourceDiscoveryItemDto[];
  @ApiProperty({ type: ResourceDiscoveryForYouPaginationDto }) pagination!: ResourceDiscoveryForYouPaginationDto;
}

export class ResourceDiscoveryRelatedDto {
  @ApiProperty({ enum: ['resource-related-v1'], example: 'resource-related-v1' }) algorithm!: string;
  @ApiProperty({ type: [ResourceDiscoveryItemDto] }) items!: ResourceDiscoveryItemDto[];
  @ApiProperty({ type: ResourceDiscoveryRelatedPaginationDto }) pagination!: ResourceDiscoveryRelatedPaginationDto;
}

export class ResourceDiscoveryHotDto {
  @ApiProperty({ enum: ['resource-download-count-v1'], example: 'resource-download-count-v1' }) algorithm!: string;
  @ApiProperty({ type: [ResourceDiscoveryItemDto] }) items!: ResourceDiscoveryItemDto[];
  @ApiProperty({ type: ResourceDiscoveryForYouPaginationDto, description: 'Pagination over the bounded 300-resource download ranking window.' }) pagination!: ResourceDiscoveryForYouPaginationDto;
}

export class ResourceDiscoveryV1MetaDto {
  @ApiProperty({ example: 'req_01J9N5K0V2' }) request_id!: string;
}

export class ResourceDiscoveryV1ErrorDto {
  @ApiProperty({ example: 'INSUFFICIENT_SCOPE' }) code!: string;
  @ApiProperty({ example: '授权权限不足' }) message!: string;
  @ApiProperty() retryable!: boolean;
  @ApiProperty({ type: 'array', items: {} }) details!: unknown[];
  @ApiProperty({ example: 'https://mdtbbs.cn/api/v1/docs/errors#insufficient-scope' }) documentation_url!: string;
}

export class ResourceDiscoveryV1ErrorEnvelopeDto {
  @ApiProperty({ type: ResourceDiscoveryV1ErrorDto }) error!: ResourceDiscoveryV1ErrorDto;
  @ApiProperty({ type: ResourceDiscoveryV1MetaDto }) meta!: ResourceDiscoveryV1MetaDto;
}

@ApiExtraModels(ResourceDiscoveryHomeDto, ResourceDiscoveryRecommendationsDto, ResourceDiscoveryRelatedDto, ResourceDiscoveryV1MetaDto, ResourceDiscoveryV1ErrorEnvelopeDto)
export class ResourceDiscoveryHomeEnvelopeDto {
  @ApiProperty({ type: ResourceDiscoveryHomeDto }) data!: ResourceDiscoveryHomeDto;
  @ApiProperty({ type: ResourceDiscoveryV1MetaDto }) meta!: ResourceDiscoveryV1MetaDto;
}

@ApiExtraModels(ResourceDiscoveryHomeDto, ResourceDiscoveryRecommendationsDto, ResourceDiscoveryRelatedDto, ResourceDiscoveryV1MetaDto, ResourceDiscoveryV1ErrorEnvelopeDto)
export class ResourceDiscoveryRecommendationsEnvelopeDto {
  @ApiProperty({ type: ResourceDiscoveryRecommendationsDto }) data!: ResourceDiscoveryRecommendationsDto;
  @ApiProperty({ type: ResourceDiscoveryV1MetaDto }) meta!: ResourceDiscoveryV1MetaDto;
}

@ApiExtraModels(ResourceDiscoveryHomeDto, ResourceDiscoveryRecommendationsDto, ResourceDiscoveryRelatedDto, ResourceDiscoveryV1MetaDto, ResourceDiscoveryV1ErrorEnvelopeDto)
export class ResourceDiscoveryRelatedEnvelopeDto {
  @ApiProperty({ type: ResourceDiscoveryRelatedDto }) data!: ResourceDiscoveryRelatedDto;
  @ApiProperty({ type: ResourceDiscoveryV1MetaDto }) meta!: ResourceDiscoveryV1MetaDto;
}

@ApiExtraModels(ResourceDiscoveryHotDto, ResourceDiscoveryV1MetaDto, ResourceDiscoveryV1ErrorEnvelopeDto)
export class ResourceDiscoveryHotEnvelopeDto {
  @ApiProperty({ type: ResourceDiscoveryHotDto }) data!: ResourceDiscoveryHotDto;
  @ApiProperty({ type: ResourceDiscoveryV1MetaDto }) meta!: ResourceDiscoveryV1MetaDto;
}
