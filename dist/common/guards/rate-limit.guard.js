"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitGuard = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../database/redis.service");
const config_1 = require("@nestjs/config");
const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;
const DEFAULT_LIMITS = {
    'handleCreate': { max: 10, window: 60 },
    'handleReply': { max: 30, window: 60 },
    'handleLogin': { max: 5, window: 300 },
    'handleVerifySession': { max: 20, window: 60 },
};
let RateLimitGuard = class RateLimitGuard {
    constructor(redis, configService) {
        this.redis = redis;
        this.configService = configService;
        this.rateLimitScript = RATE_LIMIT_SCRIPT;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const handlerName = context.getHandler().name;
        const limitConfig = DEFAULT_LIMITS[handlerName] || { max: 60, window: 60 };
        const key = `rate_limit:${ip}:${handlerName}`;
        const current = await this.redis.eval(this.rateLimitScript, [key], [limitConfig.window.toString()]);
        if (current > limitConfig.max) {
            throw new common_1.HttpException('请求过于频繁，请稍后再试', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        return true;
    }
};
exports.RateLimitGuard = RateLimitGuard;
exports.RateLimitGuard = RateLimitGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        config_1.ConfigService])
], RateLimitGuard);
//# sourceMappingURL=rate-limit.guard.js.map