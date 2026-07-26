import {
  IsString, IsNotEmpty, IsOptional, IsNumber, IsIn, IsUrl, ValidateIf,
} from 'class-validator';

export class CreateResourceDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['upload', 'external'])
  resource_type: string;

  /** Must be a real http(s) URL — see UpdateResourceDto for why. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== '' && value !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  external_url?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @IsNumber()
  is_public?: number;

  @IsOptional()
  @IsString()
  use_mfl?: string;
}
