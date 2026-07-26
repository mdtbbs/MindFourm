import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { secretsMatch } from '../utils/secret-compare.util';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    // Fail closed when unconfigured: `easymanager.apiKey` defaults to '' and a
    // plain `!==` comparison would then have accepted an empty header.
    const expectedKey = this.config.get<string>('easymanager.apiKey');
    if (!expectedKey) {
      throw new ForbiddenException('Service key is not configured');
    }

    const request = context.switchToHttp().getRequest();
    const headerKey = request.headers['x-service-key'];
    const serviceKey = Array.isArray(headerKey) ? headerKey[0] : headerKey;

    if (typeof serviceKey !== 'string' || !secretsMatch(serviceKey, expectedKey)) {
      throw new ForbiddenException('Unauthorized service');
    }

    return true;
  }
}
