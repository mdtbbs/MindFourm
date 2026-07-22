import { Controller, Get, Post, Body, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { VerifySessionDto } from './dto/verify-session.dto';
import { SkipPhoneVerification } from '../../common/decorators/skip-phone-verification.decorator';

function getSafeRedirectPath(state?: string): string {
  if (!state) {
    return '/';
  }

  let path = state;
  try {
    path = decodeURIComponent(state);
  } catch {
    path = state;
  }

  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return '/';
  }

  return path;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Check current authentication status
   */
  @Get('check')
  async check(@Req() req: Request, @Res() res: Response) {
    const sessionToken = req.cookies?.forum_session;

    if (!sessionToken) {
      return res.json({ authenticated: false });
    }

    const user = await this.authService.verifySession(sessionToken);

    if (!user) {
      return res.json({ authenticated: false });
    }

    return res.json({
      authenticated: true,
      user: {
        id: user.id,
        mindauth_id: user.mindauth_id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        role: user.role,
        bio: user.bio,
        phone_verified: user.phone_verified,
        phone_verified_at: user.phone_verified_at,
        created_at: user.created_at,
      },
    });
  }

  /**
   * OAuth callback endpoint - exchanges code for token and creates session
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!code) {
      throw new UnauthorizedException('Authorization code is required');
    }

    try {
      // Exchange code for access token
      const { accessToken, refreshToken } = await this.authService.exchangeCode(code);

      // Get user info from MindAuth
      const mindauthUser = await this.authService.getUserInfo(accessToken);

      // Find or create local user
      const user = await this.authService.getOrCreateUser(mindauthUser);

      // Generate session token and create session
      const sessionToken = this.authService.generateSessionToken();
      const ip = (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      await this.authService.createSession(user.id, sessionToken, ip, { accessToken, refreshToken });

      // Set HttpOnly cookie
      const frontendUrl = this.authService['configService'].get<string>('FRONTEND_URL') || 'http://localhost:3000';
      const isProduction = process.env.NODE_ENV === 'production';

      res.cookie('forum_session', sessionToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
        path: '/',
      });

      const redirectPath = getSafeRedirectPath(state);

      // Redirect to frontend
      return res.redirect(`${frontendUrl}${redirectPath}`);
    } catch (error) {
      throw new UnauthorizedException((error as Error).message);
    }
  }

  /**
   * Verify session token from MindAuth (service-to-service)
   */
  @Post('verify')
  @Post('verify-session')
  @SkipPhoneVerification()
  async verifySession(
    @Body() body: VerifySessionDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!body.session_token) {
      throw new UnauthorizedException('Session token is required');
    }

    const user = await this.authService.verifySession(body.session_token);

    if (!user) {
      return res.json({ valid: false });
    }

    return res.json({
      valid: true,
      user: {
        id: user.id,
        mindauth_id: user.mindauth_id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        role: user.role,
        phone_verified: user.phone_verified,
        phone_verified_at: user.phone_verified_at,
      },
    });
  }

  /**
   * Test login endpoint for E2E testing
   * Only available in development/test environment
   */
  @Post('test-login')
  @SkipPhoneVerification()
  async testLogin(
    @Body('userType') userType: string = 'user',
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const appEnv = this.authService['configService'].get<string>('app.env');
    if (appEnv === 'production' || process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Test login not available in production');
    }

    // Create session for test user (using simplified test method)
    const sessionToken = this.authService.generateSessionToken();
    const ip = (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');

    try {
      const user = await this.authService.getOrCreateTestUser(userType);
      await this.authService.createTestSession(user.id, sessionToken, ip);

      // Set HttpOnly cookie
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

  /**
   * Logout endpoint - destroys session and clears cookie
   */
  @Post('logout')
  @SkipPhoneVerification()
  async logout(@Req() req: Request, @Res() res: Response) {
    const sessionToken = req.cookies?.forum_session;

    if (!sessionToken) {
      return res.json({ success: true });
    }

    // Try to get userId from session before destroying
    const user = await this.authService.verifySession(sessionToken);

    // Destroy session
    if (user) {
      await this.authService.logout(sessionToken, user.id);
    } else {
      await this.authService.logout(sessionToken);
    }

    // Clear cookie
    res.clearCookie('forum_session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return res.json({ success: true });
  }
}
