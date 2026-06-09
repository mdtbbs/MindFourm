import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateReplyDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}
