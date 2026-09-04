import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateEmailPreferenceDto {
  @IsBoolean()
  @IsOptional()
  reply_email?: boolean;

  @IsBoolean()
  @IsOptional()
  mention_email?: boolean;

  @IsBoolean()
  @IsOptional()
  message_email?: boolean;

  @IsBoolean()
  @IsOptional()
  system_email?: boolean;

  @IsBoolean()
  @IsOptional()
  digest_email?: boolean;
}
