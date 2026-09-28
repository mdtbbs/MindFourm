import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @IsIn(['zh-CN', 'en', 'ru', 'ja'])
  preferred_locale?: string;
}
