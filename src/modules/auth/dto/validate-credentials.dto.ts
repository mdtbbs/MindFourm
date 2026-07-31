import { IsString, MinLength, MaxLength } from 'class-validator';

export class ValidateCredentialsDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}
