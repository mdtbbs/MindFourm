import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { NOTICE_STATUSES, NOTICE_TYPES, NoticeStatus, NoticeType } from '@entities/notice.entity';

export class CreateNoticeDto {
  @IsString() @MaxLength(255) title: string;
  @IsString() content_markdown: string;
  @IsOptional() @IsString() @MaxLength(500) excerpt?: string;
  @IsOptional() @IsIn(NOTICE_TYPES) notice_type?: NoticeType;
  @IsOptional() @IsIn(NOTICE_STATUSES) status?: NoticeStatus;
  @IsOptional() @IsDateString() published_at?: string;
  @IsOptional() @IsBoolean() is_pinned?: boolean;
}
