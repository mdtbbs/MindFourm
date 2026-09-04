import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateReplyDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsNumber()
  parent_reply_id?: number;
}
