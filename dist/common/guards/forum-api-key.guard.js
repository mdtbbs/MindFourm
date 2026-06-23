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
exports.ForumApiKeyGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
let ForumApiKeyGuard = class ForumApiKeyGuard {
    constructor(config) {
        this.config = config;
    }
    canActivate(context) {
        const expectedKey = this.config.get('automation.apiKey');
        if (!expectedKey) {
            throw new common_1.ForbiddenException('Service API key is not configured');
        }
        const request = context.switchToHttp().getRequest();
        const providedKey = this.extractApiKey(request);
        if (!providedKey || !this.isEqual(providedKey, expectedKey)) {
            throw new common_1.ForbiddenException('Invalid service API key');
        }
        return true;
    }
    extractApiKey(request) {
        const headerKey = request.headers['x-api-key'];
        if (Array.isArray(headerKey)) {
            return headerKey[0];
        }
        if (typeof headerKey === 'string' && headerKey.trim()) {
            return headerKey.trim();
        }
        const authorization = request.headers.authorization;
        if (typeof authorization === 'string') {
            const [type, token] = authorization.split(' ');
            if (type === 'Bearer' && token) {
                return token.trim();
            }
        }
        return undefined;
    }
    isEqual(providedKey, expectedKey) {
        const provided = Buffer.from(providedKey);
        const expected = Buffer.from(expectedKey);
        if (provided.length !== expected.length) {
            return false;
        }
        return (0, crypto_1.timingSafeEqual)(provided, expected);
    }
};
exports.ForumApiKeyGuard = ForumApiKeyGuard;
exports.ForumApiKeyGuard = ForumApiKeyGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ForumApiKeyGuard);
//# sourceMappingURL=forum-api-key.guard.js.map