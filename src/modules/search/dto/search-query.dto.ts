import { IsString, IsOptional, IsInt, Min, Max, IsIn, IsNotEmpty, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  q: string;

  @IsOptional()
  @IsIn(['post', 'user', 'global'])
  type?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['relevance', 'newest', 'oldest'])
  sort?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsIn(['en', 'ru', 'ja', 'zh-CN'])
  content_language?: string;
}
