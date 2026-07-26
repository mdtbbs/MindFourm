import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Pagination for the edit-history list.
 *
 * `@Query('page', new ParseIntPipe({ optional: true }))` looks equivalent but rejects a
 * request that simply omits the parameter — "Validation failed (numeric string is
 * expected)" — so the endpoint would 400 on its own default call. Coercing through
 * class-transformer is what the rest of this codebase does and what actually tolerates
 * an absent value.
 */
export class QueryPostRevisionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
