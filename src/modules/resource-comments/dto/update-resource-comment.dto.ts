import { IsNotEmpty } from 'class-validator';

export class UpdateResourceCommentDto {
  @IsNotEmpty()
  content: string;
}
