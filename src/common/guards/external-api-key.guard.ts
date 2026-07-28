import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RedisService } from '../../database/redis.service';
import { EXTERNAL_SCOPE_KEY } from '../decorators/external-scope.decorator';
import { ipInRange, normalizeIp } from '../../modules/bans/bans.service';
import { ExternalApiKeyService } from '../../modules/service-api/external-api-key.service';
import { hasAnyExternalScope } from '../../modules/service-api/external-api-scopes';

@Injectable()
export class ExternalApiKeyGuard implements CanActivate {
  constructor(
    private externalApiKeyService: ExternalApiKeyService,
    private redisService: RedisService,
    private reflector: Reflector,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const requestId = this.ensureRequestId(request, response);
    const plainKey = this.extractApiKey(request);

    if (!plainKey) {
      throw new UnauthorizedException({
        code: 'EXTERNAL_API_KEY_INVALID',
        message: 'Missing external API key',
      });
    }

    let key = await this.externalApiKeyService.authenticate(plainKey);
    if (!key && this.isLegacyKey(plainKey)) {
      key = this.createLegacyKey();
    }

    if (!key) {
      throw new UnauthorizedException({
        code: 'EXTERNAL_API_KEY_INVALID',
        message: 'Invalid external API key',
      });
    }

    if (!key.enabled) {
      throw new ForbiddenException({
        code: 'EXTERNAL_API_KEY_DISABLED',
        message: 'External API key is disabled',
      });
    }

    if (key.expires_at && key.expires_at.getTime() <= Date.now()) {
      throw new ForbiddenException({
        code: 'EXTERNAL_API_KEY_EXPIRED',
        message: 'External API key is expired',
      });
    }

    const apiKey = this.externalApiKeyService.toContext(key);
    this.assertIpAllowed(apiKey.allowed_ips, this.getClientIp(request));

    const requiredScopes = this.reflector.getAllAndOverride<string[]>(EXTERNAL_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];

    if (requiredScopes.length && !hasAnyExternalScope(apiKey.scopes, requiredScopes)) {
      throw new ForbiddenException({
        code: 'EXTERNAL_API_SCOPE_DENIED',
        message: 'External API key scope denied',
      });
    }

    await this.checkKeyRateLimit(apiKey.id, apiKey.rate_limit_per_minute);
    if (apiKey.id > 0) {
      this.externalApiKeyService.touchLastUsed(apiKey.id).catch(() => undefined);
    }

    request.externalApiKey = apiKey;
    request.externalRequestId = requestId;
    request.externalRequiredScopes = requiredScopes;
    return true;
  }

  private extractApiKey(request: any): string | undefined {
    const headerKey = request.headers['x-api-key'];
    if (Array.isArray(headerKey)) return headerKey[0]?.trim();
    if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim();

    const authorization = request.headers.authorization;
    if (typeof authorization === 'string') {
      const [type, token] = authorization.split(' ');
      if (type === 'Bearer' && token) return token.trim();
    }
    return undefined;
  }

  private ensureRequestId(request: any, response: any): string {
    const header = request.headers['x-request-id'];
    const requestId = Array.isArray(header) ? header[0] : header;
    const id = typeof requestId === 'string' && requestId.trim()
      ? requestId.trim().slice(0, 100)
      : randomUUID();
    response.setHeader?.('X-Request-ID', id);
    return id;
  }

  private getClientIp(request: any): string {
    return normalizeIp(request.ip || request.socket?.remoteAddress || '');
  }

  private assertIpAllowed(allowedIps: string[], clientIp: string): void {
    if (!allowedIps.length) return;

    const allowed = allowedIps.some((entry) => {
      const value = normalizeIp(entry);
      if (value.includes('/')) {
        return ipInRange(clientIp, value);
      }
      return normalizeIp(clientIp) === value;
    });

    if (!allowed) {
      throw new ForbiddenException({
        code: 'EXTERNAL_API_IP_DENIED',
        message: 'External API key is not allowed from this IP',
      });
    }
  }

  private async checkKeyRateLimit(keyId: number, maxPerMinute: number): Promise<void> {
    const key = `external_api_rate:${keyId}:${Math.floor(Date.now() / 60000)}`;
    let current: number;
    try {
      current = await this.redisService.incr(key);
      if (current === 1) {
        await this.redisService.expire(key, 65);
      }
    } catch {
      return;
    }

    if (current > maxPerMinute) {
      throw new HttpException({
        code: 'EXTERNAL_API_RATE_LIMITED',
        message: 'External API key rate limit exceeded',
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private isLegacyKey(plainKey: string): boolean {
    const legacy = this.config.get<string>('automation.apiKey');
    return !!legacy && plainKey === legacy;
  }

  private createLegacyKey(): any {
    return {
      id: -1,
      name: 'Legacy FORUM_API_KEY',
      key_prefix: 'legacy',
      key_hash: 'legacy',
      scopes_json: JSON.stringify(['admin:*', 'users:impersonate']),
      allowed_ips_json: null,
      default_user_id: null,
      rate_limit_per_minute: 120,
      enabled: true,
      expires_at: null,
      last_used_at: null,
      created_by: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }
}
