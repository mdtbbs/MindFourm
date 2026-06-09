import { CanActivate, ExecutionContext } from '@nestjs/common';
import { BansService } from '../../modules/bans/bans.service';
export declare class BanGuard implements CanActivate {
    private banService;
    constructor(banService: BansService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
