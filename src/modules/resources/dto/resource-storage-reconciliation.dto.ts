import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ResourceStorageReconciliationDto {
  @IsOptional()
  @IsBoolean()
  repair?: boolean;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  limit?: number;
}
