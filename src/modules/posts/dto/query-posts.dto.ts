import { IsArray, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class QueryPostsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  category_id?: number;

  /**
   * Comma-separated category IDs to omit from a curated discussion stream.
   * This is deliberately a list filter rather than a setting lookup so normal
   * category, search, and admin lists remain unaffected.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value !== 'string' || value.trim() === '') return undefined;
    return value.split(',').map((id) => Number(id.trim()));
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  exclude_category_ids?: number[];

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  user_id?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  server_id?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  sort?: string = 'created_at';

  @IsOptional()
  @IsString()
  order?: string = 'DESC';
}
