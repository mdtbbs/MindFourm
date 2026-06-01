const config = require('../config');
const Response = require('../utils/response');
const AuthService = require('../services/auth.service');

class AuthController {
  static check(ctx) {
    const user = ctx.state.user;

    if (user) {
      Response.success(ctx, {
        authenticated: true,
        user: {
          id: user.id,
          mindauthId: user.mindauthId,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } else {
      Response.success(ctx, { authenticated: false });
    }
  }

  static async callback(ctx) {
    const { code, state } = ctx.query;

    if (!code) {
      Response.error(ctx, 'Missing authorization code', 400);
      return;
    }

    const mindauthUser = await AuthService.exchangeCode(code);

    if (!mindauthUser) {
      Response.unauthorized(ctx, 'Failed to authenticate with MindAuth');
      return;
    }

    const user = await AuthService.getOrCreateUser(mindauthUser);
    // 传递 OAuth tokens 给 createSession，用于登出时撤销
    const sessionToken = await AuthService.createSession(
      user.id,
      ctx.ip,
      { access_token: mindauthUser.access_token, refresh_token: mindauthUser.refresh_token }
    );

    const cookieOpts = {
      maxAge: config.session.maxAge,
      httpOnly: true,
      secure: config.app.env === 'production',
      sameSite: 'lax',
      domain: process.env.COOKIE_DOMAIN || undefined,
    };

    ctx.cookies.set('forum_session', sessionToken, cookieOpts);

    const frontendUrl = config.app.frontendUrl;
    let redirectPath = '/';
    if (state) {
      const decoded = decodeURIComponent(state);
      if (decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.includes('://')) {
        redirectPath = decoded;
      }
    }
    ctx.redirect(`${frontendUrl}${redirectPath}`);
  }

  static async verifySession(ctx) {
    const { session_token } = ctx.request.body;

    if (!session_token) {
      Response.error(ctx, 'Missing session_token', 400);
      return;
    }

    const mindauthUser = await AuthService.verifyMindAuthSession(session_token);

    if (!mindauthUser) {
      Response.unauthorized(ctx, 'Invalid MindAuth session');
      return;
    }

    const user = await AuthService.getOrCreateUser(mindauthUser);
    const forumSessionToken = await AuthService.createSession(user.id);

    const cookieOpts = {
      maxAge: config.session.maxAge,
      httpOnly: true,
      secure: config.app.env === 'production',
      sameSite: 'lax',
      domain: process.env.COOKIE_DOMAIN || undefined,
    };

    ctx.cookies.set('forum_session', forumSessionToken, cookieOpts);

    Response.success(ctx, {
      user: {
        id: user.id,
        mindauthId: mindauthUser.id,
        username: mindauthUser.username,
        email: mindauthUser.email,
        role: user.role
      }
    });
  }

  static async logout(ctx) {
    const sessionToken = ctx.cookies.get('forum_session');

    if (sessionToken) {
      await AuthService.destroySession(sessionToken);
      ctx.cookies.set('forum_session', '', {
        maxAge: 0,
        domain: process.env.COOKIE_DOMAIN || undefined,
      });
    }

    Response.success(ctx, { message: 'Logged out' });
  }
}

module.exports = AuthController;