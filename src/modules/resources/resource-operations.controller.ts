import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { getClientIp } from '@common/utils/client-context.util';
import { ResourceOperationsService } from './resource-operations.service';

class SetResourceFeaturedDto {
  @IsBoolean()
  featured!: boolean;
}

@ApiExcludeController()
@Controller('admin/resources/operations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResourceOperationsController {
  constructor(
    private readonly operations: ResourceOperationsService,
  ) {}

  @Get('summary')
  @Roles('moderator', 'admin')
  summary(@Query('days') days?: string) {
    return this.operations.summary(Number(days));
  }

  @Put(':id/featured')
  @Roles('admin')
  async setFeatured(@Param('id') id: string, @Body() body: SetResourceFeaturedDto, @Req() request: any) {
    return this.operations.setFeatured(id, body.featured, {
      userId: request.user?.id,
      requestId: request.requestId,
      ipAddress: getClientIp(request),
      userAgent: request.headers?.['user-agent'],
    });
  }
}
