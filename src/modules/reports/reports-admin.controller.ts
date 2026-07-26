import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Query, Req, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { isReportStatus, isReportTargetType } from '@entities/report.entity';
import { ReportsService } from './reports.service';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { QueryAdminReportsDto } from './dto/query-reports.dto';

interface AuthenticatedRequest {
  user: { id: number };
}

@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsAdminController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /admin/reports - Moderation queue (moderator+)
   *
   * Unrecognised filter values are dropped rather than rejected: the queue is a
   * dashboard, and a stale bookmark should still render the unfiltered list.
   */
  @Get()
  @Roles('moderator', 'admin')
  async list(@Query() query: QueryAdminReportsDto) {
    return this.reportsService.listForAdmin({
      status: isReportStatus(query.status) ? query.status : undefined,
      target_type: isReportTargetType(query.target_type) ? query.target_type : undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  /**
   * PATCH /admin/reports/:id - Resolve or dismiss a report (moderator+)
   */
  @Patch(':id')
  @Roles('moderator', 'admin')
  async resolve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveReportDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reportsService.resolve(id, req.user.id, dto);
  }
}
