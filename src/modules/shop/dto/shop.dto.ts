import { IsString, IsInt, IsOptional, IsBoolean, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateShopItemDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  points_cost: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  stock?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  image_url?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  sort_order?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  is_active?: number;
}

export class UpdateShopItemDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  points_cost?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  stock?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  image_url?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  sort_order?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  is_active?: number;
}

export class QueryShopDto {
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

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  userId?: number;
}
