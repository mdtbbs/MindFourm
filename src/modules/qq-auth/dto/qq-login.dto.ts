import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class QQLoginDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  device_id?: string;
}
