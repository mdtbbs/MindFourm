import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import {
  REPORT_REASONS, REPORT_TARGET_TYPES, ReportReason, ReportTargetType,
} from '@entities/report.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReportDto {
  @ApiProperty({ enum: [...REPORT_TARGET_TYPES], example: 'post', description: '被举报对象类型。' })
  @IsIn(REPORT_TARGET_TYPES)
  target_type: ReportTargetType;

  @ApiProperty({ minimum: 1, example: 123, description: '被举报对象的 ID。' })
  @IsInt()
  @Min(1)
  target_id: number;

  @ApiProperty({ enum: [...REPORT_REASONS], example: 'spam', description: '举报原因。' })
  @IsIn(REPORT_REASONS)
  reason: ReportReason;

  @ApiPropertyOptional({ maxLength: 1000, example: '补充说明。', description: '可选补充说明，最多 1000 个字符。' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;
}
