import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { NOTICE_STATUSES, NOTICE_TYPES, NoticeStatus, NoticeType } from '@entities/notice.entity';

export class UpdateNoticeDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() content_markdown?: string;
  @IsOptional() @IsString() @MaxLength(500) excerpt?: string | null;
  @IsOptional() @IsIn(NOTICE_TYPES) notice_type?: NoticeType;
  @IsOptional() @IsIn(NOTICE_STATUSES) status?: NoticeStatus;
  @IsOptional() @IsDateString() published_at?: string | null;
  @IsOptional() @IsBoolean() is_pinned?: boolean;
  @IsOptional() @IsString() @MaxLength(255) change_summary?: string;
}
