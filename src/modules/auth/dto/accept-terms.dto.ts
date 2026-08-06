import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class AcceptTermsDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsBoolean()
  accepted: boolean;
}
