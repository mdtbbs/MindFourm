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
    const { code } = ctx.query;

    if (!code) {
      Response.error(ctx, 'Missing authorization code', 400);
      return;
    }

    const mindauthUser = await AuthService.exchangeCode(code);

    if (!mindauthUser) {
      Response.unauthorized(ctx, 'Failed to authenticate with MindAuth');
      return;
    }

    const user = AuthService.getOrCreateUser(mindauthUser);
    const sessionToken = AuthService.createSession(user.id);

    ctx.cookies.set('forum_session', sessionToken, {
      maxAge: config.session.maxAge,
      httpOnly: true
    });

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

    const user = AuthService.getOrCreateUser(mindauthUser);
    const forumSessionToken = AuthService.createSession(user.id, session_token);

    ctx.cookies.set('forum_session', forumSessionToken, {
      maxAge: config.session.maxAge,
      httpOnly: true
    });

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

  static logout(ctx) {
    const sessionToken = ctx.cookies.get('forum_session');

    if (sessionToken) {
      AuthService.destroySession(sessionToken);
      ctx.cookies.set('forum_session', '', { maxAge: 0 });
    }

    Response.success(ctx, { message: 'Logged out' });
  }
}

module.exports = AuthController;