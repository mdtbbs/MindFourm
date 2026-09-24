import { IsArray, IsOptional, IsString, MaxLength, ArrayMaxSize, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GameContentAuthorDto {
  @ApiProperty() id!: number;
  @ApiProperty() username!: string;
  @ApiProperty({ nullable: true, type: String }) avatar!: string | null;
}
export class GameContentGameDto {
  @ApiProperty({ nullable: true, type: String }) version!: string | null;
  @ApiProperty({ nullable: true, type: Number }) minBuild!: number | null;
}
export class GameContentStatsDto {
  @ApiProperty() downloads!: number;
  @ApiProperty() likes!: number;
  @ApiProperty() favorites!: number;
  @ApiProperty({ description: '真实 Resource.view_count，详情仅在成功读取公开资源后递增' }) views!: number;
}
export class GameContentViewerDto {
  @ApiProperty() liked!: boolean;
  @ApiProperty() favorited!: boolean;
  @ApiProperty() canEdit!: boolean;
}
export class GameContentPreviewDto {
  @ApiProperty({ nullable: true, type: String }) image!: string | null;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
}
export class GameContentListPreviewDto {
  @ApiProperty({ nullable: true, type: String }) thumbnail!: string | null;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
}
export class GameContentListItemDto {
  @ApiProperty({ format: 'uuid', example: 'bp_9df6c1da-c6b5-4e4c-8ea8-9d0f77cabba2' }) id!: string;
  @ApiProperty() resourceId!: number;
  @ApiProperty({ enum: ['blueprint', 'map'] }) type!: 'blueprint' | 'map';
  @ApiProperty() title!: string;
  @ApiProperty() summary!: string;
  @ApiProperty({ type: GameContentAuthorDto, nullable: true }) author!: GameContentAuthorDto | null;
  @ApiProperty({ type: GameContentListPreviewDto }) preview!: GameContentListPreviewDto;
  @ApiProperty({ type: GameContentGameDto }) game!: GameContentGameDto;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ type: GameContentStatsDto }) stats!: GameContentStatsDto;
  @ApiProperty() featured!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}
export class GameContentPaginationDto {
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
  @ApiProperty() hasMore!: boolean;
}
export class GameContentListResponseDto {
  @ApiProperty({ type: [GameContentListItemDto] }) data!: GameContentListItemDto[];
  @ApiProperty({ type: GameContentPaginationDto }) pagination!: GameContentPaginationDto;
}
export class GameContentBlueprintMaterialDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() amount!: number;
  @ApiProperty({ nullable: true, type: String }) icon!: string | null;
}
export class GameContentBlueprintBlockDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ nullable: true, type: String }) icon!: string | null;
}
export class GameContentLinksDto {
  @ApiProperty() web!: string;
  @ApiPropertyOptional() code?: string;
  @ApiPropertyOptional() download?: string;
}
export class GameContentBlueprintDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() resourceId!: number;
  @ApiProperty({ enum: ['blueprint'] }) type!: 'blueprint';
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: GameContentAuthorDto, nullable: true }) author!: GameContentAuthorDto | null;
  @ApiProperty({ type: GameContentPreviewDto }) preview!: GameContentPreviewDto;
  @ApiProperty({ type: GameContentGameDto }) game!: GameContentGameDto;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ type: GameContentStatsDto }) stats!: GameContentStatsDto;
  @ApiProperty() featured!: boolean;
  @ApiProperty({ type: GameContentViewerDto, nullable: true }) viewer!: GameContentViewerDto | null;
  @ApiProperty({ type: [GameContentBlueprintMaterialDto] }) materials!: GameContentBlueprintMaterialDto[];
  @ApiProperty({ type: [GameContentBlueprintBlockDto] }) blocks!: GameContentBlueprintBlockDto[];
  @ApiProperty({ type: GameContentLinksDto }) links!: GameContentLinksDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}
export class GameContentMapMetadataDto {
  @ApiProperty({ type: [String], nullable: true }) mode!: string[] | null;
  @ApiProperty({ nullable: true, type: Number }) players!: number | null;
  @ApiProperty({ nullable: true, type: String }) planet!: string | null;
  @ApiProperty({ nullable: true, type: 'object' }) resources!: unknown;
  @ApiProperty({ nullable: true, type: 'object' }) cores!: unknown;
  @ApiProperty({ nullable: true, type: 'object' }) waves!: unknown;
}
export class GameContentMapFileDto {
  @ApiProperty({ nullable: true, type: Number }) size!: number | null;
  @ApiProperty({ nullable: true, type: String }) sha256!: string | null;
}
export class GameContentMapDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() resourceId!: number;
  @ApiProperty({ enum: ['map'] }) type!: 'map';
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: GameContentAuthorDto, nullable: true }) author!: GameContentAuthorDto | null;
  @ApiProperty({ type: GameContentPreviewDto }) preview!: GameContentPreviewDto;
  @ApiProperty({ type: GameContentGameDto }) game!: GameContentGameDto;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ type: GameContentStatsDto }) stats!: GameContentStatsDto;
  @ApiProperty() featured!: boolean;
  @ApiProperty({ type: GameContentViewerDto, nullable: true }) viewer!: GameContentViewerDto | null;
  @ApiProperty({ type: GameContentMapMetadataDto }) map!: GameContentMapMetadataDto;
  @ApiProperty({ type: GameContentMapFileDto }) file!: GameContentMapFileDto;
  @ApiProperty({ type: GameContentLinksDto }) links!: GameContentLinksDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

export class GameContentUploadStatusDto {
  @ApiProperty({ format: 'uuid' }) uploadId!: string;
  @ApiProperty({ enum: ['uploaded', 'processing', 'completed', 'failed', 'expired'] }) status!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ nullable: true, type: Number }) resourceId!: number | null;
}

export class GameContentMapUploadCreatedDto {
  @ApiProperty({ format: 'uuid' }) uploadId!: string;
  @ApiProperty({ enum: ['ready_for_completion'] }) status!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ format: 'uri' }) preview!: string;
}

export class GameContentFeedSectionDto {
  @ApiProperty({ enum: ['featured', 'latest', 'trending'] }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: [GameContentListItemDto] }) items!: GameContentListItemDto[];
}

export class GameContentFeedResponseDto {
  @ApiProperty({ type: [GameContentFeedSectionDto] }) sections!: GameContentFeedSectionDto[];
}

export class GameContentBlueprintCodeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
}

export class CreateBlueprintDto {
  @ApiProperty({ maxLength: 255 }) @IsString() @IsNotEmpty() @MaxLength(255) title: string;
  @ApiPropertyOptional({ maxLength: 20_000 }) @IsOptional() @IsString() @MaxLength(20_000) description?: string;
  @ApiProperty({ description: 'Mindustry schematic Base64 code', maxLength: 28 * 1024 * 1024 }) @IsString() @MaxLength(28 * 1024 * 1024) code: string;
  @ApiPropertyOptional({ type: [String], maxItems: 30 }) @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) tags?: string[];
}

export class CompleteMapUploadDto {
  @ApiProperty({ maxLength: 255 }) @IsString() @IsNotEmpty() @MaxLength(255) title: string;
  @ApiPropertyOptional({ maxLength: 20_000 }) @IsOptional() @IsString() @MaxLength(20_000) description?: string;
  @ApiPropertyOptional({ type: [String], maxItems: 30 }) @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) tags?: string[];
}

export class GameContentListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) q?: string;
  @ApiPropertyOptional({ enum: ['latest', 'trending', 'featured', 'all'] }) @IsOptional() @IsString() @IsIn(['latest', 'trending', 'featured', 'all']) sort?: string;
  @ApiPropertyOptional({ enum: ['ASC', 'DESC', 'asc', 'desc'] }) @IsOptional() @IsString() @IsIn(['ASC', 'DESC', 'asc', 'desc']) order?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) tags?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) gameVersion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) author?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512) cursor?: string;
  @ApiPropertyOptional({ default: '20', maximum: 50 }) @IsOptional() @IsString() limit?: string;
}
