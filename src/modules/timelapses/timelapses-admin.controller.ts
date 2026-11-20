import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { getClientIp } from '../../common/utils/client-context.util';
import { TimelapsesService } from './timelapses.service';
import { AdminTimelapseListQueryDto, ReviewTimelapseDto } from './dto/timelapse.dto';

@Controller('admin/timelapses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimelapsesAdminController {
  constructor(private readonly timelapses: TimelapsesService) {}

  @Get()
  @Roles('moderator', 'admin')
  list(@Query() query: AdminTimelapseListQueryDto) {
    return this.timelapses.listForAdmin(query);
  }

  @Post(':id/review')
  @Roles('moderator', 'admin')
  review(@Param('id') id: string, @Body() body: ReviewTimelapseDto, @Req() req: any) {
    return this.timelapses.review(req.user.id, id, body.decision, body.reason, {
      ipAddress: getClientIp(req),
      userAgent: String(req.headers?.['user-agent'] || '').slice(0, 512),
    });
  }
}
