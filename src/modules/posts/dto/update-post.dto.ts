import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @IsNumber()
  server_id?: number;

  @IsOptional()
  @IsNumber()
  required_group_id?: number;

  @IsOptional()
  @IsString()
  post_type?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  is_pinned?: number;
}
