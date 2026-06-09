import { CanActivate, ExecutionContext } from '@nestjs/common';
import { RedisService } from '../../database/redis.service';
import { ConfigService } from '@nestjs/config';
export declare class RateLimitGuard implements CanActivate {
    private redis;
    private configService;
    private rateLimitScript;
    constructor(redis: RedisService, configService: ConfigService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
