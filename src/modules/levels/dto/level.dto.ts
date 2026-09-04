import { IsString, IsInt, IsOptional, Min, MaxLength } from 'class-validator';

export class CreateLevelDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(50)
  slug: string;

  @IsInt()
  @Min(0)
  min_points: number;

  @IsInt()
  @IsOptional()
  max_points?: number;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  icon?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  sort_order?: number;
}

export class UpdateLevelDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  slug?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  min_points?: number;

  @IsInt()
  @IsOptional()
  max_points?: number;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  icon?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  sort_order?: number;
}
