import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from '@entities/user.entity';
import { SessionAudit } from '@entities/session-audit.entity';
import { RedisService } from '@database/redis.service';
import { PointsService } from '../points/points.service';
export declare class AuthService {
    private usersRepository;
    private sessionAuditRepository;
    private redisService;
    private configService;
    private pointsService;
    private readonly sessionTtl;
    constructor(usersRepository: Repository<User>, sessionAuditRepository: Repository<SessionAudit>, redisService: RedisService, configService: ConfigService, pointsService: PointsService);
    exchangeCode(code: string): Promise<string>;
    getUserInfo(accessToken: string): Promise<{
        id: number;
        username: string;
        email: string;
        avatar_url: string;
        phone_verified?: boolean;
        phone_verified_at?: string | Date | null;
    }>;
    getOrCreateUser(mindauthUser: {
        id: number;
        username: string;
        email: string;
        avatar_url: string;
        phone_verified?: boolean;
        phone_verified_at?: string | Date | null;
    }): Promise<User>;
    syncMindAuthUserData(mindauthUser: {
        id?: number;
        mindauth_id?: number;
        username?: string;
        email?: string;
        avatar_url?: string | null;
        phone_verified?: boolean;
        phone_verified_at?: string | Date | null;
    }): Promise<User | null>;
    private fetchMindAuthUserById;
    refreshUserFromMindAuth(user: User, force?: boolean): Promise<User>;
    syncPhoneStatus(userId: number, phoneSyncToken: string): Promise<User>;
    createSession(userId: number, sessionToken: string, ip: string): Promise<void>;
    createTestSession(userId: number, sessionToken: string, ip: string): Promise<void>;
    private isProduction;
    private awardDailyLoginPoints;
    verifySession(sessionToken: string): Promise<User | null>;
    logout(sessionToken: string, userId?: number): Promise<void>;
    revokeTokens(accessToken: string, refreshToken?: string): Promise<void>;
    generateSessionToken(): string;
}
