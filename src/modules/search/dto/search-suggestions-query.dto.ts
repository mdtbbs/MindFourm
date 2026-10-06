import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchSuggestionsQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 64, example: 'mindustry' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  q: string;
}
