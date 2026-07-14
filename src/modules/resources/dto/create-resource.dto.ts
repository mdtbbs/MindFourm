import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateResourceDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  resource_type: string;

  @IsOptional()
  @IsString()
  external_url?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @IsNumber()
  is_public?: number;

  @IsOptional()
  @IsString()
  use_mfl?: string;
}
