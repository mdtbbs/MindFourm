import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import {
  REPORT_REASONS, REPORT_TARGET_TYPES, ReportReason, ReportTargetType,
} from '@entities/report.entity';

export class CreateReportDto {
  @IsIn(REPORT_TARGET_TYPES)
  target_type: ReportTargetType;

  @IsInt()
  @Min(1)
  target_id: number;

  @IsIn(REPORT_REASONS)
  reason: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;
}
