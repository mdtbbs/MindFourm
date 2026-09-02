import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { ApiTags } from '@nestjs/swagger';
import { SkipPhoneVerification } from '../../common/decorators/skip-phone-verification.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { getClientIp } from '../../common/utils/client-context.util';
import { AuthService } from './auth.service';
import { MobileExchangeDto, MobileLogoutDto, MobileRefreshDto } from './dto/mobile-auth.dto';

@ApiV1()
@ApiTags('v1-auth')
@Controller('v1/auth/mobile')
export class MobileAuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('exchange') @SkipPhoneVerification()
  exchange(@Body() dto: MobileExchangeDto, @Req() req: any) { return this.authService.exchangeMobileCode(dto.code, dto.code_verifier, dto.redirect_uri, dto.device_name, getClientIp(req), req.headers?.['user-agent']); }
  @Post('refresh') @SkipPhoneVerification()
  refresh(@Body() dto: MobileRefreshDto, @Req() req: any) { return this.authService.refreshMobileSession(dto.refresh_token, getClientIp(req), req.headers?.['user-agent']); }
  @Post('logout') @SkipPhoneVerification() @UseGuards(JwtAuthGuard)
  async logout(@Body() dto: MobileLogoutDto, @Req() req: any) { await this.authService.logoutMobileSession(req.user.id, dto.session_id); return { revoked: true }; }
  @Get('sessions') @UseGuards(JwtAuthGuard)
  sessions(@Req() req: any) { return this.authService.listMobileSessions(req.user.id); }
  @Delete('sessions/:id') @UseGuards(JwtAuthGuard)
  async revoke(@Param('id') id: string, @Req() req: any) { await this.authService.revokeMobileSession(req.user.id, id); return { revoked: true }; }
}
