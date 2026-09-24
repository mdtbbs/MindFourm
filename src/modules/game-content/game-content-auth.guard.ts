import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException, ForbiddenException, HttpStatus } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { BansService } from '../bans/bans.service';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';

/** Validates MindAuth access tokens through MindAuth userinfo; never decodes tokens locally. */
@Injectable()
export class GameContentAuthGuard implements CanActivate {
  private readonly logger = new Logger(GameContentAuthGuard.name);
  constructor(private readonly auth: AuthService, private readonly bans: BansService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authorization = req.headers?.authorization;
    if (!authorization) return true;
    const match = typeof authorization === 'string' && authorization.match(/^Bearer\s+(\S+)$/i);
    if (!match || match[1].length > 8192) throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: '无效的访问令牌' });
    try {
      const identity = await this.auth.getUserInfo(match[1]);
      if (!Number.isSafeInteger(identity.id) || identity.id <= 0 || !identity.username) {
        throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: '无效的访问令牌' });
      }
      const user = await this.auth.getOrCreateUser(identity);
      await this.bans.assertUserNotBanned(user.id);
      req.user = user;
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw new ApiV1Exception('USER_BANNED', HttpStatus.FORBIDDEN, '账号当前不可使用此服务', false);
      // Avoid putting the bearer value or upstream response into logs.
      this.logger.warn('MindAuth bearer validation failed');
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: '访问令牌无效或已过期' });
    }
  }
}

@Injectable()
export class GameContentRequiredAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '需要 MindAuth 访问令牌' });
    if (!req.user.phone_verified) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '账号尚未满足发布条件' });
    if (await this.auth.checkNeedsTermsAcceptance(req.user)) {
      throw new ApiV1Exception('TERMS_ACCEPTANCE_REQUIRED', HttpStatus.FORBIDDEN, '请先接受社区条款', false);
    }
    return true;
  }
}
