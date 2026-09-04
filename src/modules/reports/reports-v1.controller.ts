import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportsService } from './reports.service';

@ApiV1()
@ApiTags('v1-reports')
@Controller('v1/reports')
@UseGuards(JwtAuthGuard)
export class ReportsV1Controller {
  constructor(private readonly reports: ReportsService) {}
  @Post()
  @RateLimit({ max: 10, window: 3600 })
  create(@Body() dto: CreateReportDto, @Req() req: any) { return this.reports.create(req.user.id, dto); }
  @Get('mine')
  async mine(@Req() req: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    const result = await this.reports.getMyReports(req.user.id, Number(page) || 1, Math.min(50, Number(limit) || 20));
    return {
      data: result.data,
      pagination: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        total_pages: result.pagination.totalPages,
      },
    };
  }
}
