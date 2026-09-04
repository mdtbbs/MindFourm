import { IsString, IsPositive, IsOptional, IsNumber, MaxLength } from 'class-validator';

export class AwardPointsDto {
  @IsNumber()
  @IsPositive()
  user_id: number;

  @IsNumber()
  @IsPositive()
  points: number;

  @IsString()
  reason: string;
}

export class CreatePointRuleDto {
  @IsString()
  @MaxLength(50)
  action: string;

  @IsNumber()
  points: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdatePointRuleDto {
  @IsNumber()
  @IsOptional()
  points?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  is_active?: number;
}
