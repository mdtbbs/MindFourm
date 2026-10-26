import { Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchPublicUsersDto {
  @ApiProperty({ example: 'builder', minLength: 1, maxLength: 100, description: '按用户名搜索。' })
  @IsString() @MinLength(1) @MaxLength(100)
  q: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, example: 10, description: '最多返回数量，默认 10，最大 50。' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}
