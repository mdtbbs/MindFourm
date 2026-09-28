import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException, ForbiddenException, HttpStatus } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { BansService } from '../bans/bans.service';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';
import { SettingsService } from '../settings/settings.service';
import { SiteConfigService } from '@config/site-profile';

/** Validates MindAuth access tokens through MindAuth userinfo; never decodes tokens locally. */
@Injectable()
export class GameContentAuthGuard implements CanActivate {
  private readonly logger = new Logger(GameContentAuthGuard.name);
  constructor(private readonly auth: AuthService, private readonly bans: BansService, private readonly settings: SettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const path = String(req.path || req.url || '');
    const method = String(req.method || 'GET').toUpperCase();
    const uploadRoute = /\/uploads(?:\/|$)/i.test(path) || (method === 'POST' && /\/blueprints\/?$/i.test(path));
    if (uploadRoute && !await this.settings.getBoolean('feature_resources_v1_upload_enabled', true)) {
      throw new ApiV1Exception('RESOURCE_UPLOAD_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭资源上传', false);
    }
    if (!uploadRoute && method === 'GET' && /\/download(?:\/|$)/i.test(path)
      && !await this.settings.getBoolean('feature_resources_v1_download_enabled', true)) {
      throw new ApiV1Exception('FEATURE_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭资源下载', false);
    }
    if (!uploadRoute && method === 'GET' && !/\/meta\/?$/i.test(path)
      && !await this.settings.getBoolean('feature_resources_v1_read_enabled', true)) {
      throw new ApiV1Exception('FEATURE_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭 Game Content 读取', false);
    }
    const authorization = req.headers?.authorization;
    if (!authorization) return true;
    const match = typeof authorization === 'string' && authorization.match(/^Bearer\s+(\S+)$/i);
    if (!match || match[1].length > 8192) throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: '无效的访问令牌' });
    try {
      const resolved = await this.auth.resolveMindAuthBearer(match[1]);
      const user = resolved.user;
      if (resolved.context.source === 'mindauth_oauth' && !/\/meta\/?$/i.test(path)) {
        const requiredScope = uploadRoute
          ? 'resource.upload'
          : method === 'GET' && /\/download(?:\/|$)/i.test(path)
            ? 'resource.download'
            : ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? 'forum.write' : 'resource.read';
        if (!resolved.context.scopes.includes(requiredScope)) {
          throw new ApiV1Exception('INSUFFICIENT_SCOPE', HttpStatus.FORBIDDEN, '授权权限不足', false, [{ requiredScopes: [requiredScope] }]);
        }
      }
      await this.bans.assertUserNotBanned(user.id);
      req.user = user;
      req.authContext = resolved.context;
      return true;
    } catch (error) {
      if (error instanceof ApiV1Exception) throw error;
      if (error instanceof ForbiddenException) {
        const response = error.getResponse() as any;
        if (response?.code === 'INSUFFICIENT_SCOPE') {
          const details = Array.isArray(response.details) ? response.details : [];
          throw new ApiV1Exception('INSUFFICIENT_SCOPE', HttpStatus.FORBIDDEN, '授权权限不足', false, details);
        }
        throw new ApiV1Exception('USER_BANNED', HttpStatus.FORBIDDEN, '账号当前不可使用此服务', false);
      }
      // Avoid putting the bearer value or upstream response into logs.
      this.logger.warn('MindAuth bearer validation failed');
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: '访问令牌无效或已过期' });
    }
  }
}

@Injectable()
export class GameContentRequiredAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
    private readonly siteConfig?: SiteConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '需要 MindAuth 访问令牌' });
    const path = String(req.path || req.url || '');
    const method = String(req.method || 'GET').toUpperCase();
    const uploadRoute = /\/uploads(?:\/|$)/i.test(path) || (method === 'POST' && /\/blueprints\/?$/i.test(path));
    if (req.authContext?.source === 'mindauth_oauth') {
      const path = String(req.path || req.url || '');
      const requiredScope = uploadRoute
        ? 'resource.upload'
        : method === 'GET' && /\/download(?:\/|$)/i.test(path)
          ? 'resource.download'
          : ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? 'forum.write' : 'resource.read';
      if (!req.authContext.scopes.includes(requiredScope)) {
        throw new ApiV1Exception('INSUFFICIENT_SCOPE', HttpStatus.FORBIDDEN, '授权权限不足', false, [{ requiredScopes: [requiredScope] }]);
      }
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if ((this.siteConfig?.current.verification.requireEmail ?? true) && !req.user.email_verified) {
        throw new ForbiddenException({ code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Verify your email address before continuing.' });
      }
      if ((this.siteConfig?.current.verification.requirePhoneForWrites ?? true) && !req.user.phone_verified) {
        throw new ForbiddenException({ code: 'PHONE_VERIFICATION_REQUIRED', message: 'Verify your phone number before continuing.' });
      }
    }
    if (await this.auth.checkNeedsTermsAcceptance(req.user)) {
      throw new ApiV1Exception('TERMS_ACCEPTANCE_REQUIRED', HttpStatus.FORBIDDEN, '请先接受社区条款', false);
    }
    if (uploadRoute && !await this.settings.getBoolean('feature_resources_v1_upload_enabled', true)) {
      throw new ApiV1Exception('RESOURCE_UPLOAD_DISABLED', HttpStatus.FORBIDDEN, '站点已关闭资源上传', false);
    }
    return true;
  }
}
