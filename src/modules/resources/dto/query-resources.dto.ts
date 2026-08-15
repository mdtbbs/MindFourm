import { IsOptional, IsNumber, IsString, Max, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryResourcesDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  sort?: string = 'created_at';

  /** Exact metadata tag match, case/normalisation is owned by the publisher. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tag?: string;

  /** Exact match in resource metadata's supported_versions array. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  supported_version?: string;

  /** Exact match in resource metadata's compatibility array. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  compatibility?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  resource_kind?: string;
}
