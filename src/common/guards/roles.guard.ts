import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLES, RoleName } from '../utils/constants';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // No session at all is an authentication failure, not an authorization one —
    // returning false here produced a misleading 403.
    if (!user) {
      throw new UnauthorizedException('未登录');
    }

    const userRoleLevel = ROLES[user.role as RoleName] ?? 0;
    // Note: roles are hierarchical levels, so @Roles('moderator', 'admin') means
    // "at least moderator", not "exactly one of these".
    const hasRequiredRole = requiredRoles.some((role) => userRoleLevel >= ROLES[role]);

    if (!hasRequiredRole) {
      throw new ForbiddenException('权限不足');
    }

    return true;
  }
}
