import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TIMELAPSE_STATUSES, type TimelapseStatus } from '../timelapse.constants';

export class CommitTimelapseDto {
  @ApiPropertyOptional({ pattern: '^[a-f0-9]{64}$', description: '客户端计算的压缩包 SHA-256；提供时服务端会与已上传文件比对。' })
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  sha256?: string;
}

export class CreateTimelapseDraftPostDto {
  @ApiPropertyOptional({ maxLength: 200, description: '草稿标题；省略时根据地图名自动生成。' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ minimum: 1, description: '论坛分类 ID；省略时使用站点默认分类。' })
  @IsOptional()
  @IsInt()
  @Min(1)
  category_id?: number;
}

export class ReviewTimelapseDto {
  @ApiProperty({ enum: ['approve', 'reject'], description: '审核决定；通过后战报进入 published。' })
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @ApiPropertyOptional({ maxLength: 500, description: '审核说明；驳回时必填，会展示给作者。' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminTimelapseListQueryDto {
  @ApiPropertyOptional({ enum: TIMELAPSE_STATUSES, description: '按状态筛选审核队列。' })
  @IsOptional()
  @IsIn(TIMELAPSE_STATUSES)
  status?: TimelapseStatus;

  @ApiPropertyOptional({ minimum: 1, default: 1, description: '页码。' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20, description: '每页数量。' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
