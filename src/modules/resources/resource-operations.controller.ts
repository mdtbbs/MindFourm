import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { getClientIp } from '@common/utils/client-context.util';
import { LogsService } from '../logs/logs.service';
import { ResourceOperationsService } from './resource-operations.service';

class SetResourceFeaturedDto {
  @IsBoolean()
  featured!: boolean;
}

@Controller('admin/resources/operations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResourceOperationsController {
  constructor(
    private readonly operations: ResourceOperationsService,
    private readonly logs: LogsService,
  ) {}

  @Get('summary')
  @Roles('moderator', 'admin')
  summary(@Query('days') days?: string) {
    return this.operations.summary(Number(days));
  }

  @Put(':id/featured')
  @Roles('admin')
  async setFeatured(@Param('id') id: string, @Body() body: SetResourceFeaturedDto, @Req() request: any) {
    const result = await this.operations.setFeatured(id, body.featured);
    await this.logs.log({
      user_id: request.user?.id,
      action: body.featured ? 'resource.featured.add' : 'resource.featured.remove',
      target_type: 'resource',
      target_id: result.resource?.id,
      details: JSON.stringify({ public_id: id, featured: body.featured, request_id: request.requestId }),
      ip_address: getClientIp(request),
      user_agent: request.headers?.['user-agent'],
    });
    return result;
  }
}
