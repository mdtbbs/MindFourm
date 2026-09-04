import { IsString, IsInt, IsOptional, IsEnum, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGroupDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  icon?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  sort_order?: number;
}

export class UpdateGroupDto {
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
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  icon?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  sort_order?: number;
}

export class AddGroupMemberDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  user_id: number;

  @IsString()
  @IsOptional()
  @IsEnum(['member', 'moderator', 'admin'])
  role?: string;
}

export class QueryGroupsDto {
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
