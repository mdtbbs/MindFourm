import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResolveLanLinkOAuthDto {
  @IsString()
  @MinLength(16)
  @MaxLength(8192)
  access_token: string;
}
