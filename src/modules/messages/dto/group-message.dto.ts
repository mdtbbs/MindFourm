import { IsString, Length } from 'class-validator';

export class GroupMessageDto {
  @IsString()
  @Length(1, 5000)
  content: string;
}
