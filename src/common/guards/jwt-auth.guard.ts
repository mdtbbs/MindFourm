import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, IS_OPTIONAL_AUTH_KEY } from '../decorators/public.decorator';
import { AuthService } from '../../modules/auth/auth.service';
import { BansService } from '../../modules/bans/bans.service';

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
    const sessionToken = request.cookies?.forum_session || this.extractTokenFromHeader(request);

    const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!sessionToken) {
      if (isOptional) return true;
      throw new UnauthorizedException('未登录');
    }

    const user = await this.authService.verifySession(sessionToken);
    if (!user) {
      if (isOptional) return true;
      throw new UnauthorizedException('会话已过期');
    }

    // Enforced here rather than in the global BanGuard, which runs before any user
    // is resolved. Applies to optional-auth routes too: a banned user should not
    // get the authenticated view of a public page.
    await this.bansService.assertUserNotBanned(user.id);

    request.user = user;
    this.assertPhoneVerifiedForWrites(request);
    return true;
  }

  private assertPhoneVerifiedForWrites(request: any): void {
    const method = String(request.method || '').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return;
    }

    if (!request.user?.phone_verified) {
      throw new ForbiddenException({
        code: 'PHONE_NOT_VERIFIED',
        message: '请先验证手机号后再继续操作',
      });
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
