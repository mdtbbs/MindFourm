import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateGroupChatDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
