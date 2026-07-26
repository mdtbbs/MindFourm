import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../modules/auth/auth.service';
import { BansService } from '../../modules/bans/bans.service';
import { SKIP_PHONE_VERIFICATION_KEY } from '../decorators/skip-phone-verification.decorator';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class PhoneWriteGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private reflector: Reflector,
    private bansService: BansService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipPhoneVerification = this.reflector.getAllAndOverride<boolean>(
      SKIP_PHONE_VERIFICATION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipPhoneVerification) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const method = String(request.method || '').toUpperCase();
    if (!WRITE_METHODS.has(method)) {
      return true;
    }

    const user = request.user ?? await this.resolveUser(request);
    await this.bansService.assertUserNotBanned(user.id);
    request.user = user;

    if (!user.phone_verified) {
      throw new ForbiddenException({
        code: 'PHONE_NOT_VERIFIED',
        message: '请先验证手机号后再继续操作',
      });
    }

    return true;
  }

  private async resolveUser(request: any) {
    const sessionToken = request.cookies?.forum_session || this.extractTokenFromHeader(request);
    if (!sessionToken) {
      throw new UnauthorizedException('未登录');
    }

    const user = await this.authService.verifySession(sessionToken);
    if (!user) {
      throw new UnauthorizedException('会话已过期');
    }

    return user;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
