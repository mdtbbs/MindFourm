import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
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

    if (!requiredRoles) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;

    const userRoleLevel = ROLES[user.role as RoleName] ?? 0;
    const hasRequiredRole = requiredRoles.some((role) => userRoleLevel >= ROLES[role]);

    if (!hasRequiredRole) {
      throw new ForbiddenException('权限不足');
    }

    return true;
  }
}
