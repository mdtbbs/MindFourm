"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const user_entity_1 = require("../../entities/user.entity");
const session_audit_entity_1 = require("../../entities/session-audit.entity");
const redis_service_1 = require("../../database/redis.service");
const points_service_1 = require("../points/points.service");
let AuthService = class AuthService {
    constructor(usersRepository, sessionAuditRepository, redisService, configService, pointsService) {
        this.usersRepository = usersRepository;
        this.sessionAuditRepository = sessionAuditRepository;
        this.redisService = redisService;
        this.configService = configService;
        this.pointsService = pointsService;
        this.sessionTtl = 7 * 24 * 60 * 60;
    }
    async exchangeCode(code) {
        const mindauthUrl = this.configService.get('MINDAUTH_URL');
        const clientId = this.configService.get('MINDAUTH_CLIENT_ID');
        const clientSecret = this.configService.get('MINDAUTH_CLIENT_SECRET');
        const callbackUrl = this.configService.get('MINDAUTH_CALLBACK_URL');
        try {
            const response = await axios_1.default.post(`${mindauthUrl}/oauth/token`, {
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: callbackUrl,
            });
            return response.data.access_token;
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Failed to exchange code for token');
        }
    }
    async getUserInfo(accessToken) {
        const mindauthUrl = this.configService.get('MINDAUTH_URL');
        try {
            const response = await axios_1.default.get(`${mindauthUrl}/api/user`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            return response.data;
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Failed to get user info from MindAuth');
        }
    }
    async getOrCreateUser(mindauthUser) {
        let user = await this.usersRepository.findOne({
            where: { mindauth_id: mindauthUser.id },
        });
        if (!user) {
            user = this.usersRepository.create({
                mindauth_id: mindauthUser.id,
                username: mindauthUser.username,
                email: mindauthUser.email,
                avatar_url: mindauthUser.avatar_url,
                role: 'user',
            });
            await this.usersRepository.save(user);
        }
        else {
            user.username = mindauthUser.username;
            user.email = mindauthUser.email;
            if (mindauthUser.avatar_url) {
                user.avatar_url = mindauthUser.avatar_url;
            }
            await this.usersRepository.save(user);
        }
        return user;
    }
    async createSession(userId, sessionToken, ip) {
        const sessionKey = `session:${sessionToken}`;
        await this.redisService.hset(sessionKey, 'userId', userId.toString());
        await this.redisService.hset(sessionKey, 'createdAt', new Date().toISOString());
        await this.redisService.expire(sessionKey, this.sessionTtl);
        const audit = this.sessionAuditRepository.create({
            user_id: userId,
            session_token: sessionToken,
            action: 'login',
            ip_address: ip,
        });
        await this.sessionAuditRepository.save(audit);
        await this.awardDailyLoginPoints(userId);
    }
    async createTestSession(userId, sessionToken, ip) {
        const sessionKey = `session:${sessionToken}`;
        await this.redisService.hset(sessionKey, 'userId', userId.toString());
        await this.redisService.expire(sessionKey, this.sessionTtl);
    }
    async awardDailyLoginPoints(userId) {
        const cooldownKey = `daily_login:${userId}`;
        const hasClaimedToday = await this.redisService.get(cooldownKey);
        if (!hasClaimedToday) {
            await this.pointsService.awardPoints(userId, 'daily_login');
            await this.redisService.set(cooldownKey, '1', 86400);
        }
    }
    async verifySession(sessionToken) {
        const sessionKey = `session:${sessionToken}`;
        const sessionData = await this.redisService.hgetall(sessionKey);
        if (!sessionData || !sessionData.userId) {
            return null;
        }
        await this.redisService.expire(sessionKey, this.sessionTtl);
        const userId = parseInt(sessionData.userId, 10);
        const user = await this.usersRepository.findOne({
            where: { id: userId },
        });
        return user || null;
    }
    async logout(sessionToken, userId) {
        const sessionKey = `session:${sessionToken}`;
        await this.redisService.del(sessionKey);
        if (userId) {
            const audit = this.sessionAuditRepository.create({
                user_id: userId,
                session_token: sessionToken,
                action: 'logout',
            });
            await this.sessionAuditRepository.save(audit);
        }
    }
    async revokeTokens(accessToken, refreshToken) {
        const mindauthUrl = this.configService.get('MINDAUTH_URL');
        try {
            await axios_1.default.post(`${mindauthUrl}/api/revoke`, {
                access_token: accessToken,
                refresh_token: refreshToken,
            });
        }
        catch (error) {
            console.warn('Failed to revoke tokens at MindAuth:', error.message);
        }
    }
    generateSessionToken() {
        return crypto.randomBytes(48).toString('hex');
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(session_audit_entity_1.SessionAudit)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        redis_service_1.RedisService,
        config_1.ConfigService,
        points_service_1.PointsService])
], AuthService);
//# sourceMappingURL=auth.service.js.map