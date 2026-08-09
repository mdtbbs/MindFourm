import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SidebarNavigationItemDto {
  @IsString()
  id: string;

  @IsString()
  label: string;

  @IsString()
  href: string;

  @IsString()
  icon: string;

  @IsBoolean()
  enabled: boolean;

  @IsBoolean()
  requiresAuth: boolean;

  @IsString()
  @IsOptional()
  featureKey?: string;
}

export class UpdateSidebarNavigationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SidebarNavigationItemDto)
  items: SidebarNavigationItemDto[];
}
