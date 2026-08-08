import { Controller, Get, Post, Body, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { User } from '@entities/user.entity';
import { AuthService } from './auth.service';
import { VerifySessionDto } from './dto/verify-session.dto';
import { ValidateCredentialsDto } from './dto/validate-credentials.dto';
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { SkipPhoneVerification } from '../../common/decorators/skip-phone-verification.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { ExternalApiKeyGuard } from '../../common/guards/external-api-key.guard';
import { ExternalScope } from '../../common/decorators/external-scope.decorator';

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

function toAuthUser(user: User) {
  return {
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
  };
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

    // Check if the user needs to accept (or re-accept) the forum Terms & Privacy.
    // The frontend polls this endpoint and redirects to /accept-terms when the
    // flag is true, so already-logged-in users can be nudged to re-confirm after
    // the admin bumps terms_updated_at — without forcing a full re-login.
    const needsTermsAcceptance = await this.authService.checkNeedsTermsAcceptance(user);

    return res.json({
      authenticated: true,
      user: toAuthUser(user),
      needs_terms_acceptance: needsTermsAcceptance,
    });
  }

  /**
   * Force-refresh phone verification state after MindAuth SMS binding succeeds.
   */
  @Post('sync-phone-status')
  @SkipPhoneVerification()
  @RateLimit({ max: 20, window: 60 })
  async syncPhoneStatus(@Req() req: Request) {
    const sessionToken = req.cookies?.forum_session;

    if (!sessionToken) {
      throw new UnauthorizedException('论坛登录状态已失效，请重新登录后再同步手机号');
    }

    const user = await this.authService.syncPhoneStatusFromSession(sessionToken);

    return {
      user: toAuthUser(user),
    };
  }

  /**
   * Validate username/password credentials (service-to-service API)
   * Called by LanLink control plane for direct login
   */
  @Post('validate-credentials')
  @SkipPhoneVerification()
  @UseGuards(ExternalApiKeyGuard)
  @ExternalScope('lanlink:auth', 'backupsave:auth')
  @RateLimit({ max: 30, window: 60 })
  async validateCredentials(@Body() body: ValidateCredentialsDto) {
    const { username, password } = body;

    const user = await this.authService.validateUsernamePassword(username, password);

    if (!user) {
      return { valid: false };
    }

    return {
      valid: true,
      user: toAuthUser(user),
    };
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

      // T&C gate: if the admin has enabled terms enforcement and the user has
      // not yet accepted (or needs to re-accept after a policy update), skip
      // session creation and redirect to the frontend's /accept-terms screen
      // with a one-time token the screen can exchange for a session.
      if (await this.authService.checkNeedsTermsAcceptance(user)) {
        const pendingToken = crypto.randomBytes(16).toString('hex');
        await this.authService.storePendingTermsAcceptance(pendingToken, {
          userId: user.id,
          redirectPath: getSafeRedirectPath(state),
          clientIp: (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, ''),
          oauthTokens: { accessToken, refreshToken },
        });
        const frontendUrl = this.authService['configService'].get<string>('FRONTEND_URL') || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/accept-terms?token=${pendingToken}`);
      }

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
  @SkipPhoneVerification()
  @RateLimit({ max: 60, window: 60 })
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
      user: toAuthUser(user),
    });
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

  /**
   * Accept (or reject) the forum Terms / Privacy.
   *
   * Supports two flows:
   *
   * 1. **OAuth callback flow** (new login): Body is `{ token, accepted }`. The
   *    token is the one-time key returned by the MindAuth callback; accepting
   *    writes `terms_accepted_at` on the user and creates a normal forum session.
   *    Rejecting discards the pending state and redirects to the homepage.
   *
   * 2. **Session flow** (already logged in): Body is `{ accepted }` (no token).
   *    The user is identified via the session cookie. This lets existing users
   *    re-accept terms after the admin bumps `terms_updated_at`, without forcing
   *    a full re-login. Rejecting logs the user out.
   */
  @Post('accept-terms')
  @SkipPhoneVerification()
  @RateLimit({ max: 10, window: 60 })
  async acceptTerms(
    @Body() body: AcceptTermsDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendUrl = this.authService['configService'].get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const isProduction = process.env.NODE_ENV === 'production';

    // Flow 1: OAuth callback flow (token provided)
    if (body.token) {
      const pending = await this.authService.consumePendingTermsAcceptance(body.token);
      if (!pending) {
        throw new UnauthorizedException('条款接受凭证无效或已过期，请重新登录');
      }

      if (!body.accepted) {
        return res.json({ redirectPath: '/' });
      }

      await this.authService.recordTermsAcceptance(pending.userId);

      const sessionToken = this.authService.generateSessionToken();
      await this.authService.createSession(
        pending.userId,
        sessionToken,
        pending.clientIp,
        pending.oauthTokens,
      );

      res.cookie('forum_session', sessionToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return res.json({ redirectPath: `${frontendUrl}${pending.redirectPath}` });
    }

    // Flow 2: Session flow (already logged in)
    const sessionToken = req.cookies?.forum_session;
    if (!sessionToken) {
      throw new UnauthorizedException('缺少接受条款所需的凭证，请重新登录');
    }

    const user = await this.authService.verifySession(sessionToken);
    if (!user) {
      throw new UnauthorizedException('会话已失效，请重新登录');
    }

    if (!body.accepted) {
      // User rejected terms — log them out
      await this.authService.logout(sessionToken, user.id);
      res.clearCookie('forum_session', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
      });
      return res.json({ redirectPath: '/' });
    }

    // User accepted terms — update their record
    await this.authService.recordTermsAcceptance(user.id);
    return res.json({ redirectPath: '/' });
  }
}
