import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { getClientIp } from '../../common/utils/client-context.util';
import { PrivacyService } from './privacy.service';

@Controller('admin/privacy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminPrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('deletion-requests')
  async list(@Query('status') status?: string) { return this.privacy.getAdminRequests(status); }

  @Put('deletion-requests/:id')
  async review(@Param('id', ParseIntPipe) id: number, @Body() body: { status: string; resolution?: string; legal_hold_until?: string | null }, @Req() req: any) {
    return this.privacy.reviewRequest(id, req.user.id, body, { ip: getClientIp(req), userAgent: req.headers?.['user-agent'] });
  }

  @Post('retention-sweep')
  async retentionSweep(@Req() req: any) {
    const result = await this.privacy.cleanupExpiredAuditData();
    return { result, initiated_by: req.user.id };
  }
}
