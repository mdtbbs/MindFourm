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
exports.BanGuard = void 0;
const common_1 = require("@nestjs/common");
const bans_service_1 = require("../../modules/bans/bans.service");
let BanGuard = class BanGuard {
    constructor(banService) {
        this.banService = banService;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const ip = req.ip || req.connection?.remoteAddress;
        const user = req.user;
        if (ip && await this.banService.checkIp(ip)) {
            throw new common_1.ForbiddenException('Your IP has been blocked');
        }
        if (user && await this.banService.isActive('user', user.id)) {
            throw new common_1.ForbiddenException('您的账号已被封禁');
        }
        return true;
    }
};
exports.BanGuard = BanGuard;
exports.BanGuard = BanGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [bans_service_1.BansService])
], BanGuard);
//# sourceMappingURL=ban.guard.js.map