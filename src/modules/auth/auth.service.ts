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
import { AuthResult } from './interfaces/auth-result.interface';

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
  async exchangeCode(code: string): Promise<string> {
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');
    const clientId = this.configService.get<string>('MINDAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('MINDAUTH_CLIENT_SECRET');
    const callbackUrl = this.configService.get<string>('MINDAUTH_CALLBACK_URL');

    try {
      const response = await axios.post(`${mindauthUrl}/oauth/token`, {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
      });

      return response.data.access_token;
    } catch (error) {
      throw new UnauthorizedException('Failed to exchange code for token');
    }
  }

  /**
   * Get user info from MindAuth using access token
   */
  async getUserInfo(accessToken: string): Promise<{ id: number; username: string; email: string; avatar_url: string }> {
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');

    try {
      const response = await axios.get(`${mindauthUrl}/api/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error) {
      throw new UnauthorizedException('Failed to get user info from MindAuth');
    }
  }

  /**
   * Find existing user or create new one based on MindAuth user data
   */
  async getOrCreateUser(mindauthUser: { id: number; username: string; email: string; avatar_url: string }): Promise<User> {
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
    } else {
      // Update user info if changed
      user.username = mindauthUser.username;
      user.email = mindauthUser.email;
      if (mindauthUser.avatar_url) {
        user.avatar_url = mindauthUser.avatar_url;
      }
      await this.usersRepository.save(user);
    }

    return user;
  }

  /**
   * Create session in Redis and log to session_audit table
   */
  async createSession(userId: number, sessionToken: string, ip: string): Promise<void> {
    const sessionKey = `session:${sessionToken}`;

    // Store session in Redis as hash
    await this.redisService.hset(sessionKey, 'userId', userId.toString());
    await this.redisService.hset(sessionKey, 'createdAt', new Date().toISOString());
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
    const sessionKey = `session:${sessionToken}`;

    // Store session in Redis as hash (minimal operations for speed)
    await this.redisService.hset(sessionKey, 'userId', userId.toString());
    await this.redisService.expire(sessionKey, this.sessionTtl);
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

    return user || null;
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
      await axios.post(`${mindauthUrl}/api/revoke`, {
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
