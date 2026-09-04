import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AcceptTermsDto {
  @IsString()
  @IsOptional()
  token?: string;

  @IsBoolean()
  accepted: boolean;
}
