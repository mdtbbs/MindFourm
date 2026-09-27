import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SiteConfigService } from '../../config/site-profile';

@Injectable()
export class PhoneVerifiedGuard implements CanActivate {
  constructor(private readonly siteConfig: SiteConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: 'UNAUTHENTICATED',
        message: '请先登录',
      });
    }

    if (this.siteConfig.current.verification.requireEmail && !user.email_verified) {
      throw new ForbiddenException({ code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Verify your email address before continuing.' });
    }

    if (this.siteConfig.current.verification.requirePhoneForWrites && !user.phone_verified) {
      throw new ForbiddenException({
        code: 'PHONE_NOT_VERIFIED',
        message: '请先验证手机号后再继续操作',
      });
    }

    return true;
  }
}
