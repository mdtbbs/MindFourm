import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMessageV1Dto {
  @ApiProperty({ minimum: 1, example: 67, description: '接收者论坛用户 ID。' })
  @Type(() => Number) @IsInt() @Min(1)
  recipient_id: number;

  @ApiProperty({ maxLength: 5000, example: '稍后一起联机。', description: '私信正文，最多 5000 个字符。' })
  @IsString() @MaxLength(5000)
  content: string;
}

export class MessagePageV1Dto {
  @ApiPropertyOptional({ example: 'CURSOR_FROM_PREVIOUS_PAGE', description: '上一页 data.next_cursor 返回的不透明游标。' })
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50, example: 50, description: '每页会话或消息数量，最大 100。' })
  limit?: string;
}
