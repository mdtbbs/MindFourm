import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class RelayInternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const expected = this.config.get<string>('multiplayer.relayMachineCredential') || '';
    const supplied = String(request.headers['x-relay-machine-credential'] || '');
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    const credentialMatches = expectedBuffer.length >= 32
      && expectedBuffer.length === suppliedBuffer.length
      && timingSafeEqual(expectedBuffer, suppliedBuffer);
    if (!credentialMatches) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED' });
    }
    return true;
  }
}
