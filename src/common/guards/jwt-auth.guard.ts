import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, IS_OPTIONAL_AUTH_KEY } from '../decorators/public.decorator';
import { AuthService } from '../../modules/auth/auth.service';
import { BansService } from '../../modules/bans/bans.service';
import { ALLOW_BANNED_USER_KEY } from '../decorators/allow-banned-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private reflector: Reflector,
    private bansService: BansService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const user = this.authService.resolveRequestUser
      ? await this.authService.resolveRequestUser(request)
      : await this.authService.verifySession(request.cookies?.forum_session || request.headers.authorization?.split(' ')[1]);
    if (!user) {
      if (isOptional) return true;
      throw new UnauthorizedException('未登录');
    }

    // Enforced here rather than in the global BanGuard, which runs before any user
    // is resolved. Applies to optional-auth routes too: a banned user should not
    // get the authenticated view of a public page.
    const allowBannedUser = this.reflector.getAllAndOverride<boolean>(ALLOW_BANNED_USER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowBannedUser) await this.bansService.assertUserNotBanned(user.id);

    request.user = user;
    return true;
  }
}
