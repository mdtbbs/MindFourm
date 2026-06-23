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
exports.PhoneWriteGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const auth_service_1 = require("../../modules/auth/auth.service");
const skip_phone_verification_decorator_1 = require("../decorators/skip-phone-verification.decorator");
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let PhoneWriteGuard = class PhoneWriteGuard {
    constructor(authService, reflector) {
        this.authService = authService;
        this.reflector = reflector;
    }
    async canActivate(context) {
        const skipPhoneVerification = this.reflector.getAllAndOverride(skip_phone_verification_decorator_1.SKIP_PHONE_VERIFICATION_KEY, [context.getHandler(), context.getClass()]);
        if (skipPhoneVerification) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const method = String(request.method || '').toUpperCase();
        if (!WRITE_METHODS.has(method)) {
            return true;
        }
        const user = request.user ?? await this.resolveUser(request);
        request.user = user;
        if (!user.phone_verified) {
            throw new common_1.ForbiddenException({
                code: 'PHONE_NOT_VERIFIED',
                message: '请先验证手机号后再继续操作',
            });
        }
        return true;
    }
    async resolveUser(request) {
        const sessionToken = request.cookies?.forum_session || this.extractTokenFromHeader(request);
        if (!sessionToken) {
            throw new common_1.UnauthorizedException('未登录');
        }
        const user = await this.authService.verifySession(sessionToken);
        if (!user) {
            throw new common_1.UnauthorizedException('会话已过期');
        }
        return user;
    }
    extractTokenFromHeader(request) {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
};
exports.PhoneWriteGuard = PhoneWriteGuard;
exports.PhoneWriteGuard = PhoneWriteGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        core_1.Reflector])
], PhoneWriteGuard);
//# sourceMappingURL=phone-write.guard.js.map