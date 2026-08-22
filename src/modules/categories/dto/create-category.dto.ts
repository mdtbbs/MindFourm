import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export const FORUM_CATEGORY_GROUP_KEYS = ['community', 'creation', 'game', 'meta'] as const;

export const FORUM_CATEGORY_ICONS = [
  'MessageCircle', 'CircleHelp', 'BookOpen', 'Code2', 'Map', 'Shapes',
  'Radio', 'Megaphone', 'MessagesSquare', 'Wrench',
] as const;

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  @IsOptional()
  @IsIn(FORUM_CATEGORY_ICONS)
  icon?: string;

  @IsOptional()
  @IsIn(FORUM_CATEGORY_GROUP_KEYS)
  group_key?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parent_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  show_in_sidebar?: boolean;
}
