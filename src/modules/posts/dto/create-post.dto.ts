import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, IsIn } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

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

  /**
   * Constrained so a caller cannot ask for `pending` or `deleted` directly. A
   * request to publish still goes through `require_post_approval`.
   */
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;
}
