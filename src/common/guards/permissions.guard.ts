import { Injectable, CanActivate, ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS, ROLES, RoleName } from '../utils/constants';

/**
 * Check if user owns the resource OR has elevated permission
 * Mirrors requireOwnershipOrPermission from original permission.js
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;

    const userRoleLevel = ROLES[user.role as RoleName] ?? 0;

    for (const permission of requiredPermissions) {
      const requiredRoles = PERMISSIONS[permission];
      if (!requiredRoles) continue;

      const hasPermission = requiredRoles.some((role) => userRoleLevel >= ROLES[role]);
      if (hasPermission) return true;
    }

    // Check ownership as fallback
    const getResourceUserId = request.params?.id || request.body?.user_id;
    if (getResourceUserId && Number(getResourceUserId) === user.id) {
      return true;
    }

    throw new ForbiddenException('权限不足');
  }
}
