import { IsArray, IsNumber, IsOptional } from 'class-validator';

export class BulkPostsDto {
  @IsArray()
  @IsNumber({}, { each: true })
  post_ids: number[];

  @IsOptional()
  @IsNumber()
  is_pinned?: number;

  @IsOptional()
  @IsNumber()
  category_id?: number;
}
