import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ServiceAccountSelectorDto {
  @IsOptional()
  @IsNumber()
  user_id?: number;

  @IsOptional()
  @IsNumber()
  mindauth_id?: number;

  @IsOptional()
  @IsString()
  username?: string;
}
