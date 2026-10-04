import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength,
} from 'class-validator';

export class ResourceSourceSyncConfigDto {
  @ApiProperty({ format: 'uri', maxLength: 500, example: 'https://github.com/example/mod' })
  @IsString() @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'repository_url must be an HTTPS URL' }) @MaxLength(500)
  repository_url!: string;

  @ApiProperty({ description: 'Opt in to scheduled GitHub release polling and automatic import (up to once every 15 minutes). Disabled sources still support author-triggered release listing and import.' })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  stable_only?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  include_prerelease?: boolean;

  @ApiPropertyOptional({ type: [String], maxItems: 50, description: 'Optional case-insensitive asset-name globs; when non-empty, an asset must match at least one.' })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(255, { each: true })
  asset_include?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 50, description: 'Case-insensitive asset-name globs to exclude.' })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(255, { each: true })
  asset_exclude?: string[];
}

export class ResourceSourceSyncImportDto {
  @ApiProperty({ maxLength: 50, example: 'v1.2.0' })
  @IsString() @MinLength(1) @MaxLength(50)
  tag_name!: string;

  @ApiProperty({ maxLength: 255, example: 'example-mod.jar' })
  @IsString() @MinLength(1) @MaxLength(255)
  asset_name!: string;
}

export class ResourceSourceSyncReleaseQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 30, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30)
  limit = 20;
}
