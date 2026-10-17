import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { OperationAuditService } from './operation-audit.service';

function optionalInt(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

@ApiExcludeController()
@Controller('admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class OperationAuditController {
  constructor(private readonly audit: OperationAuditService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('user_id') userId?: string,
    @Query('target_id') targetId?: string,
    @Query('action') action?: string,
    @Query('action_prefix') actionPrefix?: string,
    @Query('target_type') targetType?: string,
    @Query('request_id') requestId?: string,
    @Query('q') q?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    return this.audit.list({
      page: optionalInt(page),
      limit: optionalInt(limit),
      user_id: optionalInt(userId),
      target_id: optionalInt(targetId),
      action,
      action_prefix: actionPrefix,
      target_type: targetType,
      request_id: requestId,
      q,
      since: optionalDate(since),
      until: optionalDate(until),
    });
  }

  @Get('summary')
  summary(@Query('days') days?: string) {
    return this.audit.summary(optionalInt(days));
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.audit.detail(id);
  }
}
