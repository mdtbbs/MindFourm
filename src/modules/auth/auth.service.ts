import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { User } from '@entities/user.entity';
import { SessionAudit } from '@entities/session-audit.entity';
import { RedisService } from '@database/redis.service';
import { PointsService } from '../points/points.service';
import { joinMindAuthApiUrl } from './mindauth-url.util';

@Injectable()
export class AuthService {
  private readonly sessionTtl = 7 * 24 * 60 * 60; // 7 days in seconds

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(SessionAudit)
    private sessionAuditRepository: Repository<SessionAudit>,
    private redisService: RedisService,
    private configService: ConfigService,
    private pointsService: PointsService,
  ) {}

  /**
   * Exchange OAuth authorization code for access token
   */
  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string }> {
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');
    const clientId = this.configService.get<string>('MINDAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('MINDAUTH_CLIENT_SECRET');
    const callbackUrl = this.configService.get<string>('MINDAUTH_CALLBACK_URL');

    try {
      const response = await axios.post(joinMindAuthApiUrl(mindauthUrl, '/token'), {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
      };
    } catch (error) {
      throw new UnauthorizedException('Failed to exchange code for token');
    }
  }

  /**
   * Get user info from MindAuth using access token
   */
  async getUserInfo(accessToken: string): Promise<{
    id: number;
    username: string;
    email: string;
    avatar_url: string;
    phone_verified?: boolean;
    phone_verified_at?: string | Date | null;
  }> {
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');

    try {
      const response = await axios.get(joinMindAuthApiUrl(mindauthUrl, '/userinfo'), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return {
        id: Number(response.data.id ?? response.data.sub),
        username: response.data.username ?? response.data.name,
        email: response.data.email,
        avatar_url: response.data.avatar_url,
        phone_verified: response.data.phone_verified === true,
        phone_verified_at: response.data.phone_verified_at ?? null,
      };
    } catch (error) {
      try {
        const response = await axios.get(joinMindAuthApiUrl(mindauthUrl, '/user'), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        return response.data;
      } catch {
        throw new UnauthorizedException('Failed to get user info from MindAuth');
      }
    }
  }

  /**
   * Find existing user or create new one based on MindAuth user data
   */
  async getOrCreateUser(mindauthUser: {
    id: number;
    username: string;
    email: string;
    avatar_url: string;
    phone_verified?: boolean;
    phone_verified_at?: string | Date | null;
  }): Promise<User> {
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
        phone_verified: !!mindauthUser.phone_verified,
        phone_verified_at: mindauthUser.phone_verified_at ? new Date(mindauthUser.phone_verified_at) : null,
      });
      await this.usersRepository.save(user);
    } else {
      // Update user info if changed
      user.username = mindauthUser.username;
      user.email = mindauthUser.email;
      if (mindauthUser.avatar_url) {
        user.avatar_url = mindauthUser.avatar_url;
      }
      user.phone_verified = !!mindauthUser.phone_verified;
      user.phone_verified_at = mindauthUser.phone_verified_at ? new Date(mindauthUser.phone_verified_at) : user.phone_verified_at;
      await this.usersRepository.save(user);
    }

    return user;
  }

  async syncMindAuthUserData(mindauthUser: {
    id?: number;
    mindauth_id?: number;
    username?: string;
    email?: string;
    avatar_url?: string | null;
    phone_verified?: boolean;
    phone_verified_at?: string | Date | null;
  }): Promise<User | null> {
    const mindauthId = Number(mindauthUser.id ?? mindauthUser.mindauth_id);
    if (!mindauthId) {
      return null;
    }

    const user = await this.usersRepository.findOne({ where: { mindauth_id: mindauthId } });
    if (!user) {
      return null;
    }

    if (mindauthUser.username) user.username = mindauthUser.username;
    if (mindauthUser.email) user.email = mindauthUser.email;
    if (mindauthUser.avatar_url) user.avatar_url = mindauthUser.avatar_url;
    if (typeof mindauthUser.phone_verified === 'boolean') {
      user.phone_verified = mindauthUser.phone_verified;
    }
    if (mindauthUser.phone_verified_at) {
      user.phone_verified_at = new Date(mindauthUser.phone_verified_at);
    } else if (mindauthUser.phone_verified === false) {
      user.phone_verified_at = null;
    }

    return this.usersRepository.save(user);
  }

  async refreshUserFromMindAuthWithToken(user: User, accessToken: string, refreshToken?: string, force = false): Promise<User> {
    const cooldownKey = `mindauth:user-refresh:${user.id}`;
    if (!force && (await this.redisService.get(cooldownKey))) {
      return user;
    }

    await this.redisService.set(cooldownKey, '1', 60);

    try {
      const mindauthUser = await this.getUserInfo(accessToken);
      const updated = await this.syncMindAuthUserData(mindauthUser);
      return updated ?? user;
    } catch {
      // Access token may be expired — try refreshing with refresh token
      if (refreshToken) {
        try {
          const newTokens = await this.refreshAccessToken(refreshToken);
          const mindauthUser = await this.getUserInfo(newTokens.accessToken);
          const updated = await this.syncMindAuthUserData(mindauthUser);
          return updated ?? user;
        } catch {
          // Both tokens failed — return cached user
          return user;
        }
      }
      return user;
    }
  }

  /**
   * Refresh OAuth access token using refresh token
   */
  private async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }> {
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');
    const clientId = this.configService.get<string>('MINDAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('MINDAUTH_CLIENT_SECRET');

    const response = await axios.post(joinMindAuthApiUrl(mindauthUrl, '/token'), {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
    };
  }

  /**
   * Create session in Redis and log to session_audit table
   */
  async createSession(userId: number, sessionToken: string, ip: string, oauthTokens?: { accessToken: string; refreshToken?: string }): Promise<void> {
    const sessionKey = `session:${sessionToken}`;

    // Store session in Redis as hash
    await this.redisService.hset(sessionKey, 'userId', userId.toString());
    await this.redisService.hset(sessionKey, 'createdAt', new Date().toISOString());
    if (oauthTokens?.accessToken) {
      await this.redisService.hset(sessionKey, 'accessToken', oauthTokens.accessToken);
    }
    if (oauthTokens?.refreshToken) {
      await this.redisService.hset(sessionKey, 'refreshToken', oauthTokens.refreshToken);
    }
    await this.redisService.expire(sessionKey, this.sessionTtl);

    // Log to session_audit table
    const audit = this.sessionAuditRepository.create({
      user_id: userId,
      session_token: sessionToken,
      action: 'login',
      ip_address: ip,
    });
    await this.sessionAuditRepository.save(audit);

    // Award daily login points (with 24h cooldown via Redis)
    await this.awardDailyLoginPoints(userId);
  }

  /**
   * Create session for E2E testing - skips points award and audit log to avoid blocking
   */
  async createTestSession(userId: number, sessionToken: string, ip: string): Promise<void> {
    if (this.isProduction()) {
      throw new UnauthorizedException('Test login not available in production');
    }

    const sessionKey = `session:${sessionToken}`;

    await this.usersRepository.update(userId, {
      phone_verified: true,
      phone_verified_at: new Date(),
    });

    // Store session in Redis as hash (minimal operations for speed)
    await this.redisService.hset(sessionKey, 'userId', userId.toString());
    await this.redisService.expire(sessionKey, this.sessionTtl);
  }

  async getOrCreateTestUser(userType: string): Promise<User> {
    if (this.isProduction()) {
      throw new UnauthorizedException('Test login not available in production');
    }

    const users: Record<string, { mindauthId: number; username: string; role: string }> = {
      admin: { mindauthId: 900001, username: 'e2e_admin', role: 'admin' },
      moderator: { mindauthId: 900002, username: 'e2e_moderator', role: 'moderator' },
      user: { mindauthId: 900003, username: 'e2e_user', role: 'user' },
    };
    const config = users[userType] || users.user;

    let user = await this.usersRepository.findOne({
      where: { mindauth_id: config.mindauthId },
    });

    if (!user) {
      user = this.usersRepository.create({
        mindauth_id: config.mindauthId,
        username: config.username,
        email: `${config.username}@example.test`,
        role: config.role,
        avatar_url: '',
        phone_verified: true,
        phone_verified_at: new Date(),
      });
    } else {
      user.username = config.username;
      user.email = `${config.username}@example.test`;
      user.role = config.role;
      user.phone_verified = true;
      user.phone_verified_at = new Date();
    }

    return this.usersRepository.save(user);
  }

  private isProduction(): boolean {
    return this.configService.get<string>('app.env') === 'production' || process.env.NODE_ENV === 'production';
  }

  /**
   * Award daily login points with cooldown
   */
  private async awardDailyLoginPoints(userId: number): Promise<void> {
    const cooldownKey = `daily_login:${userId}`;
    const hasClaimedToday = await this.redisService.get(cooldownKey);

    if (!hasClaimedToday) {
      await this.pointsService.awardPoints(userId, 'daily_login');
      // Set 24-hour cooldown
      await this.redisService.set(cooldownKey, '1', 86400);
    }
  }

  /**
   * Verify session token - returns user if valid, null otherwise
   */
  async verifySession(sessionToken: string): Promise<User | null> {
    const sessionKey = `session:${sessionToken}`;
    const sessionData = await this.redisService.hgetall(sessionKey);

    if (!sessionData || !sessionData.userId) {
      return null;
    }

    // Sliding window: refresh TTL on each successful verification
    await this.redisService.expire(sessionKey, this.sessionTtl);

    const userId = parseInt(sessionData.userId, 10);
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) return null;

    const accessToken = sessionData.accessToken;
    const refreshToken = sessionData.refreshToken;
    if (accessToken) {
      return this.refreshUserFromMindAuthWithToken(user, accessToken, refreshToken);
    }

    return user;
  }

  /**
   * Logout - destroy session from Redis
   */
  async logout(sessionToken: string, userId?: number): Promise<void> {
    const sessionKey = `session:${sessionToken}`;
    await this.redisService.del(sessionKey);

    // Log to session_audit if userId available
    if (userId) {
      const audit = this.sessionAuditRepository.create({
        user_id: userId,
        session_token: sessionToken,
        action: 'logout',
      });
      await this.sessionAuditRepository.save(audit);
    }
  }

  /**
   * Revoke tokens at MindAuth level
   * @deprecated OAuth tokens are only used once during login.
   * This method is optional and exists for cleanup purposes.
   * The local Redis session is the primary authentication mechanism.
   */
  async revokeTokens(accessToken: string, refreshToken?: string): Promise<void> {
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');

    try {
      await axios.post(joinMindAuthApiUrl(mindauthUrl, '/revoke'), {
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    } catch (error) {
      // Silently fail - local session is already destroyed
      console.warn('Failed to revoke tokens at MindAuth:', (error as Error).message);
    }
  }

  /**
   * Generate a secure session token
   */
  generateSessionToken(): string {
    return crypto.randomBytes(48).toString('hex');
  }
}
