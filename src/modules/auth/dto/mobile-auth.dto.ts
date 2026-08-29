import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class MobileExchangeDto {
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() code_verifier: string;
  @IsString() @IsNotEmpty() @MaxLength(2048) redirect_uri: string;
  @IsString() @IsNotEmpty() @MaxLength(128) device_name: string;
}
export class MobileRefreshDto { @IsString() @IsNotEmpty() refresh_token: string; }
export class MobileLogoutDto { @IsUUID() session_id: string; }
