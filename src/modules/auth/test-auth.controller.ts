import { Controller, Post, Body, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SkipPhoneVerification } from '../../common/decorators/skip-phone-verification.decorator';
import { isTestAuthEnabled } from './test-auth.util';

/**
 * Session shortcut for the Playwright suite, bypassing the MindAuth OAuth round
 * trip.
 *
 * This controller is only registered when {@link isTestAuthEnabled} returns true
 * (see `AuthModule`), so in a normal deployment the route does not exist in the
 * router at all rather than existing and refusing.
 */
@Controller('auth')
export class TestAuthController {
  constructor(private authService: AuthService) {}

  @Post('test-login')
  @SkipPhoneVerification()
  async testLogin(
    @Body('userType') userType: string = 'user',
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Registration is already conditional; this second check keeps the endpoint
    // inert if the module wiring is ever changed to register it unconditionally.
    if (!isTestAuthEnabled()) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const sessionToken = this.authService.generateSessionToken();
    const ip = (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');

    try {
      const user = await this.authService.getOrCreateTestUser(userType);
      await this.authService.createTestSession(user.id, sessionToken, ip);

      res.cookie('forum_session', sessionToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return res.json({ success: true, userId: user.id, sessionToken });
    } catch (error) {
      return res.status(500).json({ error: (error as Error).message });
    }
  }
}
