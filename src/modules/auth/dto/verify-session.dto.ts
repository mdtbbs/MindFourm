import { IsString } from 'class-validator';

export class VerifySessionDto {
  @IsString()
  session_token: string;
}
