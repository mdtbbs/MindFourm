import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMessageV1Dto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  recipient_id: number;

  @ApiProperty({ maxLength: 5000 })
  @IsString() @MaxLength(5000)
  content: string;
}

export class MessagePageV1Dto {
  @ApiPropertyOptional({ description: 'Opaque cursor returned by the previous page.' })
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  limit?: string;
}
