import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const serviceKey = request.headers['x-service-key'];
    const expectedKey = this.config.get<string>('easymanager.apiKey');

    if (!serviceKey || serviceKey !== expectedKey) {
      throw new ForbiddenException('Unauthorized service');
    }

    return true;
  }
}
