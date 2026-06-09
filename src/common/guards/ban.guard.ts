import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BansService } from '../../modules/bans/bans.service';

@Injectable()
export class BanGuard implements CanActivate {
  constructor(private banService: BansService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip || req.connection?.remoteAddress;
    const user = req.user;

    // Check IP ban
    if (ip && await this.banService.checkIp(ip)) {
      throw new ForbiddenException('Your IP has been blocked');
    }

    // Check user ban
    if (user && await this.banService.isActive('user', user.id)) {
      throw new ForbiddenException('您的账号已被封禁');
    }

    return true;
  }
}
