import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { NOTICE_STATUSES, NOTICE_TYPES, NoticeStatus, NoticeType } from '@entities/notice.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNoticeDto {
  @ApiProperty({ maxLength: 255, example: '服务器维护通知', description: '公告标题。' })
  @IsString() @MaxLength(255) title: string;
  @ApiProperty({ example: '维护窗口为今晚 22:00。', description: '公告 Markdown 正文。' })
  @IsString() content_markdown: string;
  @ApiPropertyOptional({ maxLength: 500, example: '服务将于今晚维护。', description: '可选摘要；省略时从正文生成。' })
  @IsOptional() @IsString() @MaxLength(500) excerpt?: string;
  @ApiPropertyOptional({ enum: [...NOTICE_TYPES], example: 'maintenance', description: '公告类型；默认 system。' })
  @IsOptional() @IsIn(NOTICE_TYPES) notice_type?: NoticeType;
  @ApiPropertyOptional({ enum: [...NOTICE_STATUSES], example: 'published', description: '公告状态；默认 published。' })
  @IsOptional() @IsIn(NOTICE_STATUSES) status?: NoticeStatus;
  @ApiPropertyOptional({ format: 'date-time', example: '2026-09-30T12:00:00.000Z', description: '预定发布时间。' })
  @IsOptional() @IsDateString() published_at?: string;
  @ApiPropertyOptional({ example: false, description: '是否置顶。' })
  @IsOptional() @IsBoolean() is_pinned?: boolean;
}
