import { IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateResourceCommentDto {
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsNumber()
  parent_comment_id?: number;
}
