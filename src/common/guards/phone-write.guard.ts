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
import { SiteConfigService } from '../../config/site-profile';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class PhoneWriteGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private reflector: Reflector,
    private bansService: BansService,
    private siteConfig: SiteConfigService,
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

    // Administrators are already authenticated and authorized by route guards.
    // Account verification gates are for community participation, not for
    // blocking site owners from managing the forum or using normal features.
    if (user.role === 'admin') {
      return true;
    }

    if (this.siteConfig.current.verification.requireEmail && !user.email_verified) {
      throw new ForbiddenException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Verify your email address before continuing.',
      });
    }

    if (this.siteConfig.current.verification.requirePhoneForWrites && !user.phone_verified) {
      throw new ForbiddenException({
        code: 'PHONE_NOT_VERIFIED',
        message: '请先完成手机号安全验证后再继续操作',
      });
    }

    return true;
  }

  private async resolveUser(request: any) {
    if (!request.cookies?.forum_session && !request.headers.authorization) {
      throw new UnauthorizedException('未登录');
    }

    const user = await this.authService.resolveRequestUser(request);
    if (!user) {
      throw new UnauthorizedException('会话已过期');
    }

    return user;
  }

}
