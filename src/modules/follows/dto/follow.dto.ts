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

// `followerId` used to be accepted from the request body, which let any
// authenticated caller create follows on behalf of another user. The follower is
// now always taken from the session, so this payload carries nothing.
