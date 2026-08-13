import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BansService } from '../../modules/bans/bans.service';
import { getClientIp } from '../utils/client-context.util';

/**
 * Blocks banned IPs before any route runs.
 *
 * Registered globally (see `AppModule`). It deliberately does *not* check user
 * bans: as a global guard it runs before the controller-scoped `JwtAuthGuard`, so
 * `req.user` is not populated yet. User bans are enforced where the session is
 * turned into a user — see `assertUserNotBanned` in `BansService`, called from
 * `JwtAuthGuard` and `PhoneWriteGuard`.
 */
@Injectable()
export class BanGuard implements CanActivate {
  constructor(private banService: BansService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const ip = req.clientIp || getClientIp(req);

    if (ip && (await this.banService.checkIp(ip))) {
      throw new ForbiddenException('Your IP has been blocked');
    }

    return true;
  }
}
