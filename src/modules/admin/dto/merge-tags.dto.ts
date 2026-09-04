import { IsNumber } from 'class-validator';

export class MergeTagsDto {
  @IsNumber()
  from_tag_id: number;

  @IsNumber()
  to_tag_id: number;
}
