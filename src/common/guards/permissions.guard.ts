import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS, ROLES, RoleName } from '../utils/constants';

/**
 * Role-based permission check for routes annotated with `@Permissions(...)`.
 *
 * Deliberately does *not* implement an "or the caller owns it" fallback. The
 * previous version compared `request.params.id || request.body.user_id` against
 * `user.id`: `body.user_id` is attacker-supplied, so sending your own id satisfied
 * any permission, and `params.id` is a resource id rather than an owner id.
 *
 * A generic guard cannot know who owns a resource — it has not been loaded yet.
 * Ownership belongs in the service that fetches the row (as `PostsService.update`
 * and `ResourcesService.update` already do).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('未登录');
    }

    const userRoleLevel = ROLES[user.role as RoleName] ?? 0;

    for (const permission of requiredPermissions) {
      const requiredRoles = PERMISSIONS[permission];
      if (!requiredRoles) {
        // An unknown permission name must not silently pass.
        throw new ForbiddenException('权限不足');
      }

      const hasPermission = requiredRoles.some((role) => userRoleLevel >= ROLES[role]);
      if (hasPermission) return true;
    }

    throw new ForbiddenException('权限不足');
  }
}
