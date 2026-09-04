import { IsString, Length } from 'class-validator';

export class CreateGroupChatDto {
  @IsString()
  @Length(1, 255)
  name: string;

  @IsString()
  description?: string;
}
