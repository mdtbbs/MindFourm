import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { SecurityAccessLogsService } from './security-access-logs.service';
import { SecurityAccessLogQueryDto } from './security-access-logs.query.dto';

@ApiExcludeController()
@Controller('admin/security-access-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SecurityAccessLogsController {
  constructor(private readonly logs: SecurityAccessLogsService) {}

  @Get()
  get(@Query() query: SecurityAccessLogQueryDto, @Req() request: any) {
    return this.logs.search(query, request.user, request);
  }
}
