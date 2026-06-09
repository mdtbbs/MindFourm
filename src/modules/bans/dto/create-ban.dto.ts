import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateBanDto {
  @IsString()
  @IsNotEmpty()
  ban_type: string;

  @IsString()
  @IsNotEmpty()
  value: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
