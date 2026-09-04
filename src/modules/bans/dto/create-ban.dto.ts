import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export const BAN_TYPES = ['user', 'ip', 'ip_range'] as const;

export class CreateBanDto {
  @IsIn(BAN_TYPES)
  ban_type: string;

  @IsString()
  @IsNotEmpty()
  value: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
