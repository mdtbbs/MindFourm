"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhoneVerifiedGuard = void 0;
const common_1 = require("@nestjs/common");
let PhoneVerifiedGuard = class PhoneVerifiedGuard {
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user) {
            throw new common_1.ForbiddenException({
                code: 'UNAUTHENTICATED',
                message: '请先登录',
            });
        }
        if (!user.phone_verified) {
            throw new common_1.ForbiddenException({
                code: 'PHONE_NOT_VERIFIED',
                message: '请先验证手机号后再继续操作',
            });
        }
        return true;
    }
};
exports.PhoneVerifiedGuard = PhoneVerifiedGuard;
exports.PhoneVerifiedGuard = PhoneVerifiedGuard = __decorate([
    (0, common_1.Injectable)()
], PhoneVerifiedGuard);
//# sourceMappingURL=phone-verified.guard.js.map