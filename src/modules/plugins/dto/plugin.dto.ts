import { IsString, IsBoolean, IsOptional, IsArray, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export interface PluginHookDef {
  name: string;
  type?: 'before' | 'after' | 'filter';
  handler: string;
  priority?: number;
}

export class PluginMetadata {
  @IsString()
  @MaxLength(50)
  slug: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(20)
  version: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  author?: string;

  @IsArray()
  @IsOptional()
  dependencies?: string[];

  @IsArray()
  @IsOptional()
  hooks?: PluginHookDef[];
}

export class UpdatePluginConfigDto {
  @IsOptional()
  config: Record<string, any>;
}
