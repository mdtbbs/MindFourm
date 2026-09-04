import { IsNumber, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsNumber()
  recipient_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;
}
