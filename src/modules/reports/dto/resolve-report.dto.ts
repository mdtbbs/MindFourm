import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { REPORT_RESOLUTION_STATUSES, ReportResolutionStatus } from '@entities/report.entity';

export class ResolveReportDto {
  // `pending` is excluded on purpose: reopening a handled report would leave
  // handled_by/handled_at pointing at a decision that no longer applies.
  @IsIn(REPORT_RESOLUTION_STATUSES)
  status: ReportResolutionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolution_note?: string;
}
