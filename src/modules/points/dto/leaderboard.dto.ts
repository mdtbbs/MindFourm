import { IsOptional, IsPositive } from 'class-validator';

export class QueryLeaderboardDto {
  @IsOptional()
  @IsPositive()
  limit?: number;

  @IsOptional()
  @IsPositive()
  page?: number;
}
