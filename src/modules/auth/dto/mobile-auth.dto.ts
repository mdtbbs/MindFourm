import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class MobileExchangeDto {
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() code_verifier: string;
  // Native authorization codes are not browser OAuth codes; this legacy
  // client field is accepted for wire compatibility but is never trusted.
  @IsOptional() @IsString() @MaxLength(2048) redirect_uri?: string;
  @IsString() @IsNotEmpty() @MaxLength(128) device_name: string;
}
export class MobileRefreshDto { @IsString() @IsNotEmpty() refresh_token: string; }
export class MobileLogoutDto { @IsUUID() session_id: string; }
