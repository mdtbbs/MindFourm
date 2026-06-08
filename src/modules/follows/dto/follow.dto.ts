import { IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryFollowsDto {
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

export class FollowUserDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  followerId: number;
}
