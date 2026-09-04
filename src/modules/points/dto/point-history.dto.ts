import { IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class QueryPointHistoryDto {
  @IsOptional()
  @IsPositive()
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
