import { IsString, MaxLength, MinLength } from 'class-validator';

export class ValidateLanLinkQuickCodeDto {
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  code: string;
}
