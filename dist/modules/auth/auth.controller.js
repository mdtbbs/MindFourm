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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const verify_session_dto_1 = require("./dto/verify-session.dto");
const mindauth_service_guard_1 = require("../../common/guards/mindauth-service.guard");
const skip_phone_verification_decorator_1 = require("../../common/decorators/skip-phone-verification.decorator");
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    async check(req, res) {
        const sessionToken = req.cookies?.forum_session;
        if (!sessionToken) {
            return res.json({ authenticated: false });
        }
        const user = await this.authService.verifySession(sessionToken);
        if (!user) {
            return res.json({ authenticated: false });
        }
        return res.json({
            authenticated: true,
            user: {
                id: user.id,
                mindauth_id: user.mindauth_id,
                username: user.username,
                email: user.email,
                avatar_url: user.avatar_url,
                role: user.role,
                bio: user.bio,
                phone_verified: user.phone_verified,
                phone_verified_at: user.phone_verified_at,
                created_at: user.created_at,
            },
        });
    }
    async callback(code, state, req, res) {
        if (!code) {
            throw new common_1.UnauthorizedException('Authorization code is required');
        }
        try {
            const accessToken = await this.authService.exchangeCode(code);
            const mindauthUser = await this.authService.getUserInfo(accessToken);
            const user = await this.authService.getOrCreateUser(mindauthUser);
            const sessionToken = this.authService.generateSessionToken();
            const ip = (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
            await this.authService.createSession(user.id, sessionToken, ip);
            const frontendUrl = this.authService['configService'].get('FRONTEND_URL') || 'http://localhost:3000';
            const isProduction = process.env.NODE_ENV === 'production';
            res.cookie('forum_session', sessionToken, {
                httpOnly: true,
                secure: isProduction,
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/',
            });
            return res.redirect(frontendUrl);
        }
        catch (error) {
            throw new common_1.UnauthorizedException(error.message);
        }
    }
    async verifySession(body, req, res) {
        if (!body.session_token) {
            throw new common_1.UnauthorizedException('Session token is required');
        }
        const user = await this.authService.verifySession(body.session_token);
        if (!user) {
            return res.json({ valid: false });
        }
        return res.json({
            valid: true,
            user: {
                id: user.id,
                mindauth_id: user.mindauth_id,
                username: user.username,
                email: user.email,
                avatar_url: user.avatar_url,
                role: user.role,
                phone_verified: user.phone_verified,
                phone_verified_at: user.phone_verified_at,
            },
        });
    }
    async syncPhoneStatus(phoneSyncToken, req, res) {
        const sessionToken = req.cookies?.forum_session;
        if (!sessionToken) {
            throw new common_1.UnauthorizedException('Session token is required');
        }
        const currentUser = await this.authService.verifySession(sessionToken);
        if (!currentUser) {
            throw new common_1.UnauthorizedException('Session expired');
        }
        const user = await this.authService.syncPhoneStatus(currentUser.id, phoneSyncToken);
        return res.json({
            success: true,
            user: {
                id: user.id,
                mindauth_id: user.mindauth_id,
                username: user.username,
                email: user.email,
                avatar_url: user.avatar_url,
                role: user.role,
                bio: user.bio,
                phone_verified: user.phone_verified,
                phone_verified_at: user.phone_verified_at,
                created_at: user.created_at,
            },
        });
    }
    async syncUserFromMindAuth(body) {
        const user = await this.authService.syncMindAuthUserData(body.user ?? body);
        return {
            synced: !!user,
            user_id: user?.id ?? null,
        };
    }
    async testLogin(userType = 'user', req, res) {
        const appEnv = this.authService['configService'].get('app.env');
        if (appEnv === 'production' || process.env.NODE_ENV === 'production') {
            throw new common_1.UnauthorizedException('Test login not available in production');
        }
        const testUsers = {
            admin: 1,
            moderator: 2,
            user: 3,
        };
        const userId = testUsers[userType] || 3;
        const sessionToken = this.authService.generateSessionToken();
        const ip = (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
        try {
            await this.authService.createTestSession(userId, sessionToken, ip);
            res.cookie('forum_session', sessionToken, {
                httpOnly: true,
                secure: false,
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/',
            });
            return res.json({ success: true, userId, sessionToken });
        }
        catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
    async logout(req, res) {
        const sessionToken = req.cookies?.forum_session;
        if (!sessionToken) {
            return res.json({ success: true });
        }
        const user = await this.authService.verifySession(sessionToken);
        if (user) {
            await this.authService.logout(sessionToken, user.id);
        }
        else {
            await this.authService.logout(sessionToken);
        }
        res.clearCookie('forum_session', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });
        return res.json({ success: true });
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Get)('check'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "check", null);
__decorate([
    (0, common_1.Get)('callback'),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "callback", null);
__decorate([
    (0, common_1.Post)('verify'),
    (0, common_1.Post)('verify-session'),
    (0, skip_phone_verification_decorator_1.SkipPhoneVerification)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_session_dto_1.VerifySessionDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifySession", null);
__decorate([
    (0, common_1.Post)('sync-phone-status'),
    (0, skip_phone_verification_decorator_1.SkipPhoneVerification)(),
    __param(0, (0, common_1.Body)('phone_sync_token')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "syncPhoneStatus", null);
__decorate([
    (0, common_1.Post)('internal/users/sync'),
    (0, skip_phone_verification_decorator_1.SkipPhoneVerification)(),
    (0, common_1.UseGuards)(mindauth_service_guard_1.MindAuthServiceGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "syncUserFromMindAuth", null);
__decorate([
    (0, common_1.Post)('test-login'),
    (0, skip_phone_verification_decorator_1.SkipPhoneVerification)(),
    __param(0, (0, common_1.Body)('userType')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "testLogin", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, skip_phone_verification_decorator_1.SkipPhoneVerification)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map