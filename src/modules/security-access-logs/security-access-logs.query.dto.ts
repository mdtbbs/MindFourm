import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsIP, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SecurityAccessLogQueryDto {
  @IsOptional() @IsString() @MaxLength(80) request_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) user_id?: number;
  @IsOptional() @IsIP() ip_address?: string;
  @IsOptional() @IsString() @MaxLength(100) route?: string;
  @IsOptional() @IsString() @MaxLength(100) resource_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(599) status_code?: number;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}
