import {
  Body, Controller, Get, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { QueryReportsDto } from './dto/query-reports.dto';

interface AuthenticatedRequest {
  user: { id: number };
}

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * POST /reports - File a report against a post, reply, resource or user.
   *
   * Rate limited well below the global default: a report costs a moderator's
   * attention, so flooding the queue is itself a form of abuse.
   */
  @Post()
  @RateLimit({ max: 10, window: 3600 })
  async create(@Body() dto: CreateReportDto, @Req() req: AuthenticatedRequest) {
    return this.reportsService.create(req.user.id, dto);
  }

  /**
   * GET /reports/mine - Reports the caller has filed, with their outcomes.
   */
  @Get('mine')
  async getMine(@Req() req: AuthenticatedRequest, @Query() query: QueryReportsDto) {
    return this.reportsService.getMyReports(req.user.id, query.page ?? 1, query.limit ?? 20);
  }
}
