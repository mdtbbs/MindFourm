import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class ServerApprovedCallbackDto {
  @IsString()
  @IsNotEmpty()
  server_name: string;

  @IsNumber()
  server_id: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  category_slug?: string;

  @IsOptional()
  @IsString()
  event_id?: string;
}