import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MindAuthServiceGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const serviceKey = request.headers['x-service-key'];
    const expectedKey = this.config.get<string>('MINDAUTH_SERVICE_KEY');

    if (!expectedKey || !serviceKey || serviceKey !== expectedKey) {
      throw new ForbiddenException('Unauthorized MindAuth service');
    }

    return true;
  }
}
