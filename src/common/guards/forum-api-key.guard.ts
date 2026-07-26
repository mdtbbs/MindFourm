import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { secretsMatch } from '../utils/secret-compare.util';

@Injectable()
export class ForumApiKeyGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedKey = this.config.get<string>('automation.apiKey');
    if (!expectedKey) {
      throw new ForbiddenException('Service API key is not configured');
    }

    const request = context.switchToHttp().getRequest();
    const providedKey = this.extractApiKey(request);
    if (!providedKey || !secretsMatch(providedKey, expectedKey)) {
      throw new ForbiddenException('Invalid service API key');
    }

    return true;
  }

  private extractApiKey(request: any): string | undefined {
    const headerKey = request.headers['x-api-key'];
    if (Array.isArray(headerKey)) {
      return headerKey[0];
    }
    if (typeof headerKey === 'string' && headerKey.trim()) {
      return headerKey.trim();
    }

    const authorization = request.headers.authorization;
    if (typeof authorization === 'string') {
      const [type, token] = authorization.split(' ');
      if (type === 'Bearer' && token) {
        return token.trim();
      }
    }

    return undefined;
  }
}
