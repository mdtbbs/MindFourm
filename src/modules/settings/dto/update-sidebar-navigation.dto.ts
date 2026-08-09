import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SidebarIconName } from '@common/utils/sidebar-navigation.util';

class SidebarNavigationItemDto {
  @IsString()
  id: string;

  @IsString()
  label: string;

  @IsString()
  href: string;

  @IsString()
  icon: SidebarIconName;

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
