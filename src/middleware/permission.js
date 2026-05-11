const Response = require('../utils/response');
const { PERMISSIONS, ROLES } = require('../utils/constants');

function hasRole(userRole, requiredRoles) {
  return requiredRoles.includes(userRole);
}

function requirePermission(permission) {
  return async (ctx, next) => {
    const user = ctx.state.user;

    if (!user) {
      return Response.error(ctx, 'Authentication required', 401, 'UNAUTHENTICATED');
    }

    const requiredRoles = PERMISSIONS[permission];

    if (!requiredRoles || !hasRole(user.role, requiredRoles)) {
      return Response.error(ctx, 'Insufficient permissions', 403, 'FORBIDDEN');
    }

    return next();
  };
}

function requireOwnershipOrPermission(permission, getResourceUserId) {
  return async (ctx, next) => {
    const user = ctx.state.user;

    if (!user) {
      return Response.error(ctx, 'Authentication required', 401, 'UNAUTHENTICATED');
    }

    const resourceUserId = await getResourceUserId(ctx);
    const isOwner = resourceUserId === user.id;
    const hasElevatedPermission = hasRole(user.role, PERMISSIONS[permission]);

    if (!isOwner && !hasElevatedPermission) {
      return Response.error(ctx, 'You can only modify your own content', 403, 'FORBIDDEN');
    }

    return next();
  };
}

function requireAdmin(ctx, next) {
  const user = ctx.state.user;

  if (!user || user.role !== 'admin') {
    return Response.error(ctx, 'Admin access required', 403, 'FORBIDDEN');
  }

  return next();
}

function requireModerator(ctx, next) {
  const user = ctx.state.user;

  if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
    return Response.error(ctx, 'Moderator access required', 403, 'FORBIDDEN');
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
