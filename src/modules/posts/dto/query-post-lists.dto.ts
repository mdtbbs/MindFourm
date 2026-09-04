import { IsInt, IsOptional, IsString, Max, MinLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query shapes for the small public post lists.
 *
 * These used `@Query('limit', new ParseIntPipe({ optional: true }))`, which reads as
 * "optional" but rejects a request that omits the parameter — so `/posts/trending`,
 * `/posts/pinned` and `/posts/search` each answered 400 to their own documented default
 * call. Coercion through class-transformer tolerates an absent value, which is what the
 * rest of the codebase relies on.
 */
export class QueryTrendingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class QueryPinnedDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  category_id?: number;
}

/** Plain page/limit, for the list endpoints that take nothing else. */
export class QueryPostPageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class QueryPostSearchDto {
  @IsString()
  @MinLength(1)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
