import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SearchIndexMaintenanceDto } from './dto/search-index-maintenance.dto';
import { SearchIndexMaintenanceService } from './search-index-maintenance.service';

@ApiTags('search-index-maintenance')
@Controller('search/admin/indexes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SearchIndexMaintenanceController {
  constructor(private readonly maintenance: SearchIndexMaintenanceService) {}

  @Get()
  @RateLimit({ max: 30, window: 60 })
  status() { return this.maintenance.getStatus(); }

  @Post(':key')
  @RateLimit({ max: 1, window: 60 })
  run(@Param('key') key: string, @Body() body: SearchIndexMaintenanceDto, @Req() request: any) {
    return this.maintenance.run(key, body.action, request.user.id);
  }
}
