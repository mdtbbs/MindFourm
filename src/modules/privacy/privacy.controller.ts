import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrivacyService } from './privacy.service';
import { getClientIp } from '../../common/utils/client-context.util';

@Controller('privacy')
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Post('deletion-requests')
  async create(@Body() body: { reason?: string }, @Req() req: any) {
    return this.privacy.createRequest(req.user.id, body?.reason, { ip: getClientIp(req), userAgent: req.headers?.['user-agent'] });
  }

  @Get('deletion-requests/me')
  async mine(@Req() req: any) {
    return this.privacy.getOwnRequests(req.user.id);
  }
}
