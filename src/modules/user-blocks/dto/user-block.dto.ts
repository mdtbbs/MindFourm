import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUserBlockDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  blocked_id: number;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  reason?: string;
}

// The blocker is never part of the payload — it comes from the session — so that a
// caller cannot create or remove blocks on another user's behalf.
export class QueryUserBlocksDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
