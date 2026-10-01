import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { NOTICE_STATUSES, NOTICE_TYPES, NoticeStatus, NoticeType } from '@entities/notice.entity';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNoticeDto {
  @ApiPropertyOptional({ maxLength: 255, example: '更新后的公告标题', description: '公告标题。' })
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @ApiPropertyOptional({ example: '更新后的 Markdown 正文。', description: '公告 Markdown 正文。' })
  @IsOptional() @IsString() content_markdown?: string;
  @ApiPropertyOptional({ maxLength: 500, nullable: true, example: null, description: '公告摘要；传 null 时由正文生成。' })
  @IsOptional() @IsString() @MaxLength(500) excerpt?: string | null;
  @ApiPropertyOptional({ enum: [...NOTICE_TYPES], example: 'maintenance', description: '公告类型。' })
  @IsOptional() @IsIn(NOTICE_TYPES) notice_type?: NoticeType;
  @ApiPropertyOptional({ enum: [...NOTICE_STATUSES], example: 'published', description: '公告状态。' })
  @IsOptional() @IsIn(NOTICE_STATUSES) status?: NoticeStatus;
  @ApiPropertyOptional({ format: 'date-time', nullable: true, example: null, description: '预定发布时间；传 null 可清除。' })
  @IsOptional() @IsDateString() published_at?: string | null;
  @ApiPropertyOptional({ example: true, description: '是否置顶。' })
  @IsOptional() @IsBoolean() is_pinned?: boolean;
  @ApiPropertyOptional({ maxLength: 255, example: '修正维护时段', description: '本次编辑说明；用于修订历史。' })
  @IsOptional() @IsString() @MaxLength(255) change_summary?: string;
}
