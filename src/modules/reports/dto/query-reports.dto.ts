import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Pagination for the report lists.
 *
 * `@Query('page', new ParseIntPipe({ optional: true }))` looked equivalent but rejected
 * a request that simply omitted the parameter — "Validation failed (numeric string is
 * expected)" — so both list endpoints 400'd on their own default call. Coercing through
 * class-transformer is what the rest of this codebase does and what actually tolerates
 * an absent value.
 */
export class QueryReportsDto {
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

/** Adds the queue's filters. Unrecognised values are dropped by the controller. */
export class QueryAdminReportsDto extends QueryReportsDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  target_type?: string;
}
