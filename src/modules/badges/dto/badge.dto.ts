import { IsString, IsInt, IsOptional, IsEnum, MaxLength } from 'class-validator';

export class CreateBadgeDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(50)
  slug: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  icon?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  @IsEnum(['bronze', 'silver', 'gold', 'platinum'])
  level?: string;

  @IsOptional()
  criteria?: string; // JSON string stored in DB

  @IsInt()
  @IsOptional()
  is_active?: number;
}

export class UpdateBadgeDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  slug?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  icon?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  @IsEnum(['bronze', 'silver', 'gold', 'platinum'])
  level?: string;

  @IsOptional()
  criteria?: string; // JSON string stored in DB

  @IsInt()
  @IsOptional()
  is_active?: number;
}

export class AwardBadgeDto {
  @IsInt()
  user_id: number;

  @IsInt()
  badge_id: number;

  @IsString()
  @IsOptional()
  granted_by?: string;
}
