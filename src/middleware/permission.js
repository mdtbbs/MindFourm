const { PERMISSIONS, ROLES } = require('../utils/constants');

function hasRole(userRole, requiredRoles) {
  return requiredRoles.includes(userRole);
}

function requirePermission(permission) {
  return async (ctx, next) => {
    const user = ctx.state.user;

    if (!user) {
      ctx.status = 401;
      ctx.body = { success: false, message: 'Authentication required' };
      return;
    }

    const requiredRoles = PERMISSIONS[permission];

    if (!requiredRoles || !hasRole(user.role, requiredRoles)) {
      ctx.status = 403;
      ctx.body = { success: false, message: 'Insufficient permissions' };
      return;
    }

    return next();
  };
}

function requireOwnershipOrPermission(permission, getResourceUserId) {
  return async (ctx, next) => {
    const user = ctx.state.user;

    if (!user) {
      ctx.status = 401;
      ctx.body = { success: false, message: 'Authentication required' };
      return;
    }

    const resourceUserId = await getResourceUserId(ctx);
    const isOwner = resourceUserId === user.id;
    const hasElevatedPermission = hasRole(user.role, PERMISSIONS[permission]);

    if (!isOwner && !hasElevatedPermission) {
      ctx.status = 403;
      ctx.body = { success: false, message: 'You can only modify your own content' };
      return;
    }

    return next();
  };
}

function requireAdmin(ctx, next) {
  const user = ctx.state.user;

  if (!user || user.role !== 'admin') {
    ctx.status = 403;
    ctx.body = { success: false, message: 'Admin access required' };
    return;
  }

  return next();
}

function requireModerator(ctx, next) {
  const user = ctx.state.user;

  if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
    ctx.status = 403;
    ctx.body = { success: false, message: 'Moderator access required' };
    return;
  }

  return next();
}

module.exports = {
  hasRole,
  requirePermission,
  requireOwnershipOrPermission,
  requireAdmin,
  requireModerator
};