const config = require('../config');
const db = require('../database');
const AuthService = require('../services/auth.service');

function authMiddleware(options = {}) {
  const { required = true, roles = [] } = options;

  return async (ctx, next) => {
    const sessionToken = ctx.headers['authorization']?.replace('Bearer ', '')
      || ctx.cookies.get('forum_session');

    if (!sessionToken) {
      if (required) {
        ctx.status = 401;
        ctx.body = { success: false, message: 'Not authenticated' };
        return;
      }
      ctx.state.user = null;
      return next();
    }

    const session = AuthService.validateSession(sessionToken);

    if (!session) {
      if (required) {
        ctx.status = 401;
        ctx.body = { success: false, message: 'Session expired or invalid' };
        return;
      }
      ctx.state.user = null;
      return next();
    }

    // If session has mindauth_token, verify it with MindAuth
    // For OAuth sessions (no mindauth_token), we trust the mindauth_id stored in users table
    let userInfo = null;
    if (session.mindauth_token) {
      userInfo = await AuthService.verifyMindAuthSession(session.mindauth_token);
      if (!userInfo) {
        AuthService.destroySession(sessionToken);
        if (required) {
          ctx.status = 401;
          ctx.body = { success: false, message: 'Authentication expired' };
          return;
        }
        ctx.state.user = null;
        return next();
      }
    } else {
      // OAuth session - get user info from database
      userInfo = AuthService.getUserByMindauthId(session.mindauth_id);
    }

    ctx.state.user = {
      id: session.user_id,
      mindauthId: userInfo.id,
      username: userInfo.username,
      email: userInfo.email,
      role: session.role,
      createdAt: userInfo.created_at
    };

    if (roles.length > 0 && !roles.includes(ctx.state.user.role)) {
      ctx.status = 403;
      ctx.body = { success: false, message: 'Insufficient permissions' };
      return;
    }

    return next();
  };
}

module.exports = { authMiddleware };