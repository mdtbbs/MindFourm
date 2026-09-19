import {
  IsString, IsNotEmpty, IsOptional, IsNumber, IsIn, IsUrl, ValidateIf, IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateResourceCompatibilityDto {
  @IsOptional()
  @IsString()
  min_version_value?: string;

  @IsOptional()
  @IsString()
  max_version_value?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateResourceDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['upload', 'external'])
  resource_type: string;

  /** Must be a real http(s) URL — see UpdateResourceDto for why. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== '' && value !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  external_url?: string;

  @IsString()
  @IsNotEmpty()
  version: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  is_public?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;

  /** Canonical upstream source for this resource, distinct from a download URL. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== '' && value !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  source_url?: string;

  @IsOptional()
  @IsString()
  license?: string;

  /** The submitting account is recorded separately from these credits. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  original_authors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  maintainers?: string[];

  /** Mindustry compatibility belongs to a release, never to release.version. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateResourceCompatibilityDto)
  compatibility?: CreateResourceCompatibilityDto[];
}
