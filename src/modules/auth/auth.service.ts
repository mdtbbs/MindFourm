import {
  HttpException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { extname } from 'path';
import { mkdirSync } from 'fs';
import { User } from '@entities/user.entity';
import { SessionAudit } from '@entities/session-audit.entity';
import { LegalAcceptance } from '@entities/legal-acceptance.entity';
import { MobileSession } from '@entities/mobile-session.entity';
import { MobileRefreshToken } from '@entities/mobile-refresh-token.entity';
import { RedisService } from '@database/redis.service';
import { PointsService } from '../points/points.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { joinMindAuthApiUrl } from './mindauth-url.util';

/**
 * Every outbound MindAuth call goes through this instance.
 *
 * The bare `axios` default is no timeout at all, so a hung or unreachable MindAuth
 * left forum request handlers waiting indefinitely — and `verifySession` sits on the
 * hot path of every authenticated request.
 */
const MINDAUTH_TIMEOUT_MS = 8000;
const mindAuthHttp = axios.create({ timeout: MINDAUTH_TIMEOUT_MS });
const MINDAUTH_OAUTH_CACHE_TTL_SECONDS = 30;

/**
 * How long a forum user's MindAuth profile is trusted without re-reading `/userinfo`.
 *
 * The cooldown has to be enforced in the backend's own memory as well as Redis.
 * When Redis goes down the old check-and-set pair degraded to a per-process store
 * that was *cleared* on reconnect, so the cooldown vanished and every authenticated
 * request synchronously fetched `/userinfo` and wrote the user row — turning a read
 * surge into a MySQL write surge during exactly the outage it should have absorbed.
 */
const MINDAUTH_REFRESH_COOLDOWN_SECONDS = 60;

/**
 * Claim or reuse the one pending refresh attempt for this forum session.
 * Keeping the old refresh token and key in the same Redis hash lets concurrent
 * API workers safely retry the exact request after a timeout.
 */
const BEGIN_MINDAUTH_REFRESH_SCRIPT = `
local currentRefreshToken = redis.call('HGET', KEYS[1], 'refreshToken')
if currentRefreshToken ~= ARGV[1] then
  return { 'ROTATED', redis.call('HGET', KEYS[1], 'accessToken') or '', currentRefreshToken or '' }
end
local pendingRefreshToken = redis.call('HGET', KEYS[1], 'mindAuthRefreshPendingToken')
local pendingKey = redis.call('HGET', KEYS[1], 'mindAuthRefreshPendingKey')
if pendingRefreshToken and pendingKey then
  if pendingRefreshToken ~= ARGV[1] then return { 'CONFLICT' } end
  return { 'READY', pendingKey }
end
if pendingRefreshToken or pendingKey then return { 'CONFLICT' } end
redis.call('HSET', KEYS[1], 'mindAuthRefreshPendingToken', ARGV[1], 'mindAuthRefreshPendingKey', ARGV[2])
return { 'READY', ARGV[2] }
`;

/** Persist the rotation and clear its pending key atomically after success. */
const COMPLETE_MINDAUTH_REFRESH_SCRIPT = `
local currentRefreshToken = redis.call('HGET', KEYS[1], 'refreshToken')
local pendingRefreshToken = redis.call('HGET', KEYS[1], 'mindAuthRefreshPendingToken')
local pendingKey = redis.call('HGET', KEYS[1], 'mindAuthRefreshPendingKey')
if currentRefreshToken == ARGV[1] and pendingRefreshToken == ARGV[1] and pendingKey == ARGV[4] then
  redis.call('HSET', KEYS[1], 'accessToken', ARGV[2], 'refreshToken', ARGV[3])
  redis.call('HDEL', KEYS[1], 'mindAuthRefreshPendingToken', 'mindAuthRefreshPendingKey')
  return 1
end
if currentRefreshToken == ARGV[3] and redis.call('HGET', KEYS[1], 'accessToken') == ARGV[2] then return 1 end
return 0
`;

/**
 * Digest a session token for the audit trail.
 *
 * `session_audit.session_token` used to hold the raw 96-hex-char bearer token,
 * forever — so any SQL read primitive, database backup or read-replica leak handed
 * over a set of directly replayable live sessions. Nothing ever reads the column
 * back, so a one-way digest costs nothing. (MindAuth already does this for its own
 * `user_sessions` table.)
 */
function hashSessionToken(sessionToken: string): string {
  return crypto.createHash('sha256').update(sessionToken).digest('hex');
}

function hashMindAuthBearer(accessToken: string): string {
  return crypto.createHash('sha256').update(accessToken).digest('hex');
}

function normalizeVerificationFlag(value: unknown): boolean | undefined {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return undefined;
}

function toMobileAuthUser(user: User) {
  return { id: user.id, username: user.username, email: user.email, avatar_url: user.avatar_url, role: user.role, phone_verified: user.phone_verified };
}

const AVATAR_UPLOAD_DIR = './uploads/avatars';

type PendingTermsPayload = {
  userId: number;
  redirectPath: string;
  clientIp: string;
  oauthTokens: {
    accessToken: string;
    refreshToken?: string;
  };
};

type LegalAcceptanceContext = {
  clientIp?: string | null;
  userAgent?: string | null;
};

export type ClientAuthContext = {
  source: 'forum_session' | 'forum_mobile_legacy' | 'mindauth_oauth';
  clientId?: string;
  scopes: string[];
  clientType?: 'public' | 'confidential';
  partyType?: 'first_party' | 'third_party';
  expiresAt?: number;
};

const LEGACY_FIRST_PARTY_SCOPES = [
  'openid', 'profile', 'email', 'forum.read', 'forum.write',
  'resource.read', 'resource.download', 'resource.upload',
  'notification.read', 'message.read', 'message.write',
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly requestUsers = new WeakMap<object, Promise<User | null>>();
  private readonly sessionTtl = 7 * 24 * 60 * 60; // 7 days in seconds

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(SessionAudit)
    private sessionAuditRepository: Repository<SessionAudit>,
    @InjectRepository(LegalAcceptance)
    private legalAcceptanceRepository: Repository<LegalAcceptance>,
    private redisService: RedisService,
    private configService: ConfigService,
    private pointsService: PointsService,
    private notificationsService: NotificationsService,
    private settingsService: SettingsService,
    @InjectRepository(MobileSession)
    private mobileSessionRepository: Repository<MobileSession>,
    @InjectRepository(MobileRefreshToken)
    private mobileRefreshTokenRepository: Repository<MobileRefreshToken>,
    private jwtService: JwtService,
  ) {}

  /**
   * Download an avatar from MindAuth and save it locally.
   * Content-addressed names keep the URL stable when MindAuth returns the same
   * image, while changed images get a new immutable URL. Old files are retained
   * because open pages and cached profiles may continue using their URLs.
   * Returns the local avatar_url path, or null if download failed.
   */
  private async downloadAvatarToLocal(
    mindauthAvatarUrl: string,
    mindauthId: number,
  ): Promise<string | null> {
    if (!mindauthAvatarUrl) return null;

    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');
    const fullUrl = `${mindauthUrl}${mindauthAvatarUrl}`;
    const sourcePath = mindauthAvatarUrl.split(/[?#]/, 1)[0];
    const ext = extname(sourcePath).toLowerCase() || '.png';

    mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
    let temporaryPath: string | undefined;

    try {
      const response = await mindAuthHttp.get(fullUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      const image = Buffer.from(response.data);
      const digest = crypto.createHash('sha256').update(image).digest('hex');
      const filename = `oa_${mindauthId}_${digest}${ext}`;
      const localPath = path.join(AVATAR_UPLOAD_DIR, filename);
      const publicUrl = `/uploads/avatars/${filename}`;

      try {
        const existingImage = await fs.readFile(localPath);
        if (existingImage.equals(image)) return publicUrl;
      } catch {
        // The file may not exist yet, or an earlier write may have been partial.
      }

      temporaryPath = `${localPath}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporaryPath, image, { flag: 'wx' });
      await fs.rename(temporaryPath, localPath);
      temporaryPath = undefined;
      return publicUrl;
    } catch (err) {
      this.logger.warn(
        `Failed to download avatar from MindAuth (${fullUrl}): ${(err as Error).message}`,
      );
      if (temporaryPath) await fs.unlink(temporaryPath).catch(() => undefined);
      return null;
    }
  }

  /**
   * Sync an avatar from MindAuth without invalidating URLs already issued to clients.
   * Returns the local avatar_url, or the original remote path if download failed.
   */
  private async syncAvatarFromMindAuth(
    mindauthAvatarUrl: string,
    mindauthId: number,
  ): Promise<string> {
    const localUrl = await this.downloadAvatarToLocal(mindauthAvatarUrl, mindauthId);
    if (localUrl) return localUrl;

    // Download failed — fall back to the remote path so the DB at least has something
    return mindauthAvatarUrl;
  }

  /**
   * Exchange OAuth authorization code for access token
   */
  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string }> {
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');
    const clientId = this.configService.get<string>('MINDAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('MINDAUTH_CLIENT_SECRET');
    const callbackUrl = this.configService.get<string>('MINDAUTH_CALLBACK_URL');

    try {
      const response = await mindAuthHttp.post(joinMindAuthApiUrl(mindauthUrl, '/token'), {
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

  async exchangeMobileCode(code: string, codeVerifier: string, _redirectUri: string | undefined, deviceName: string, ip: string, userAgent?: string): Promise<any> {
    if (!code || !codeVerifier) throw new UnauthorizedException('Invalid mobile authorization exchange');
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');
    const clientId = this.configService.get<string>('mindauth.nativeClientId');
    const clientSecret = this.configService.get<string>('mindauth.nativeExchangeSecret');
    try {
      // Native codes are intentionally not OAuth browser codes.  MindAuth
      // consumes them here, validates PKCE, and returns user data only to this
      // trusted server; Android never receives a MindAuth web session/token.
      const response = await mindAuthHttp.post(
        joinMindAuthApiUrl(mindauthUrl, '/v1/native/auth/exchange'),
        { client_id: clientId, code, code_verifier: codeVerifier },
        { headers: { 'x-mindfourm-client-secret': clientSecret } },
      );
      const user = await this.getOrCreateUser(response.data.user);
      if (await this.checkNeedsTermsAcceptance(user)) throw new UnauthorizedException({ code: 'TERMS_ACCEPTANCE_REQUIRED', message: '请先接受社区条款' });
      return this.createMobileSession(user, deviceName, ip, userAgent);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Failed to exchange mobile authorization code');
    }
  }

  async createMobileSession(user: User, deviceName: string, ip: string, userAgent?: string): Promise<any> {
    const session = await this.mobileSessionRepository.save(this.mobileSessionRepository.create({
      id: crypto.randomUUID(), user_id: user.id, device_name: deviceName.trim().slice(0, 128) || 'Android',
      ip_address: ip || null, user_agent: userAgent?.slice(0, 4096) || null, last_seen_at: new Date(), revoked_at: null,
    }));
    const refresh = await this.issueMobileRefreshToken(session.id, crypto.randomUUID());
    await this.writeMobileAudit(user.id, session.id, 'mobile_login', ip);
    return this.mobileTokenResponse(user, session, refresh.raw);
  }

  async refreshMobileSession(rawRefreshToken: string, ip: string, userAgent?: string): Promise<any> {
    const tokenHash = this.hashMobileRefreshToken(rawRefreshToken);
    const token = await this.mobileRefreshTokenRepository.findOne({ where: { token_hash: tokenHash }, relations: { session: { user: true } } });
    if (!token || token.expires_at <= new Date()) throw new UnauthorizedException({ code: 'REFRESH_TOKEN_INVALID', message: '登录已过期' });
    if (token.revoked_at) {
      await this.mobileRefreshTokenRepository.update({ family_id: token.family_id, revoked_at: IsNull() }, { revoked_at: new Date() });
      await this.mobileSessionRepository.update(token.session_id, { revoked_at: new Date() });
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_REUSED', message: '登录凭证已失效，请重新登录' });
    }
    if (token.session.revoked_at) throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: '设备会话已被撤销' });
    // Consume first with a conditional update. This is the concurrency boundary:
    // exactly one contender can change revoked_at from NULL, before any successor
    // token is minted. A loser is a reuse attempt, never a second successful refresh.
    const consumed = await this.mobileRefreshTokenRepository.update(
      { id: token.id, revoked_at: IsNull() },
      { revoked_at: new Date() },
    );
    if (!consumed.affected) {
      await this.mobileRefreshTokenRepository.update({ family_id: token.family_id, revoked_at: IsNull() }, { revoked_at: new Date() });
      await this.mobileSessionRepository.update(token.session_id, { revoked_at: new Date() });
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_REUSED', message: '登录凭证已失效，请重新登录' });
    }
    const replacement = await this.issueMobileRefreshToken(token.session_id, token.family_id);
    await this.mobileRefreshTokenRepository.update(token.id, { replaced_by_id: replacement.id });
    await this.mobileSessionRepository.update(token.session_id, { last_seen_at: new Date(), ip_address: ip || token.session.ip_address, user_agent: userAgent?.slice(0, 4096) || token.session.user_agent });
    return this.mobileTokenResponse(token.session.user, token.session, replacement.raw);
  }

  async verifyMobileAccessToken(accessToken: string): Promise<User | null> {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: number; sid: string; aud: string; iss: string }>(accessToken, {
        secret: this.configService.get<string>('mobileAuth.jwtSecret') || 'development-only-mobile-auth-secret',
        audience: this.configService.get<string>('mobileAuth.audience') || 'android', issuer: this.configService.get<string>('mobileAuth.issuer'),
      });
      const session = await this.mobileSessionRepository.findOne({ where: { id: payload.sid, user_id: payload.sub, revoked_at: IsNull() }, relations: { user: true } });
      if (!session) return null;
      // Revocation is still checked above on every request. Last-seen writes are
      // infrequent and conditional, so concurrent workers cannot undo a revocation.
      if (!session.last_seen_at || Date.now() - session.last_seen_at.getTime() >= 60_000) {
        void this.mobileSessionRepository.update({
          id: session.id, revoked_at: IsNull(),
          last_seen_at: session.last_seen_at ? LessThanOrEqual(new Date(Date.now() - 60_000)) : IsNull(),
        }, { last_seen_at: new Date() })
          .catch(() => this.logger.warn('Unable to update mobile session activity'));
      }
      return session.user;
    } catch { return null; }
  }

  resolveRequestUser(request: any): Promise<User | null> {
    // Share only server-validated results within this request; request.user is
    // deliberately ignored. Ban and scope guards continue checking each route.
    const existing = this.requestUsers.get(request);
    if (existing) return existing;
    const resolving = this.resolveRequestUserUncached(request).then(async (user) => {
      if (user) {
        try { await this.redisService.recordUserActivity(user.id); }
        catch { this.logger.warn('Unable to record authenticated activity'); }
      }
      return user;
    });
    this.requestUsers.set(request, resolving);
    return resolving;
  }

  private async resolveRequestUserUncached(request: any): Promise<User | null> {
    const sessionToken = request.cookies?.forum_session;
    if (sessionToken) {
      const user = await this.verifySession(sessionToken);
      if (user) request.authContext = { source: 'forum_session', scopes: LEGACY_FIRST_PARTY_SCOPES } satisfies ClientAuthContext;
      return user;
    }
    const token = this.extractBearerToken(request);
    if (!token) return null;
    if (token.includes('.')) {
      const user = await this.verifyMobileAccessToken(token);
      if (user) request.authContext = { source: 'forum_mobile_legacy', scopes: LEGACY_FIRST_PARTY_SCOPES } satisfies ClientAuthContext;
      return user;
    }
    const resolved = await this.resolveMindAuthBearer(token);
    request.authContext = resolved.context;
    return resolved.user;
  }

  /** Validate opaque MindAuth Bearers with the server-only confidential resource-server client. */
  async resolveMindAuthBearer(accessToken: string): Promise<{ user: User; context: ClientAuthContext }> {
    try {
      let token: any;
      let identity: Awaited<ReturnType<AuthService['getUserInfo']>> | null = null;
      const cached = await this.readMindAuthBearerCache(accessToken);
      if (cached) {
        token = cached.token;
        identity = cached.identity;
      } else {
        token = await this.introspectMindAuthToken(accessToken);
      }
      if (token?.active !== true || !token.sub || !token.client_id) throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: '访问令牌无效或已过期' });
      if (token.exp && Number(token.exp) <= Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: '访问令牌无效或已过期' });
      }
      const scopes = String(token.scope || '').split(/\s+/).filter(Boolean);
      // Existing server-owned Native Auth tokens carry this legacy marker. Keep
      // their Game Content path working while new OAuth clients request explicit
      // resource scopes; never infer grants from client_id or User-Agent alone.
      if (token.party_type === 'first_party' && scopes.includes('game_content')) {
        for (const legacyScope of ['resource.read', 'resource.download', 'resource.upload']) {
          if (!scopes.includes(legacyScope)) scopes.push(legacyScope);
        }
      }
      if (!identity) identity = await this.getUserInfo(accessToken);
      if (!Number.isSafeInteger(identity.id) || identity.id !== Number(token.sub)) {
        throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'MindAuth 身份信息不一致' });
      }
      if (!cached) await this.writeMindAuthBearerCache(accessToken, token, identity);
      let user = await this.usersRepository.findOne({ where: { mindauth_id: identity.id } });
      if (!user) {
        if (!scopes.includes('profile') || !identity.username) {
          throw new ForbiddenException({ code: 'INSUFFICIENT_SCOPE', message: '首次使用 MDTBBS 需要 profile scope' });
        }
        user = await this.getOrCreateUser(identity);
      } else if (scopes.includes('profile') && identity.username) {
        user = await this.getOrCreateUser(identity);
      }
      return {
        user,
        context: {
          source: 'mindauth_oauth', clientId: token.client_id, scopes,
          clientType: token.client_type === 'public' ? 'public' : token.client_type === 'confidential' ? 'confidential' : undefined,
          partyType: token.party_type === 'third_party' ? 'third_party' : token.party_type === 'first_party' ? 'first_party' : undefined,
          expiresAt: Number.isSafeInteger(token.exp) ? Number(token.exp) : undefined,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error;
      this.logger.warn('MindAuth Bearer introspection failed');
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: '访问令牌无效或认证服务暂不可用' });
    }
  }

  private async readMindAuthBearerCache(accessToken: string): Promise<{
    token: { active: boolean; sub: string; client_id: string; scope?: string; client_type?: string; party_type?: string; exp?: number };
    identity: Awaited<ReturnType<AuthService['getUserInfo']>>;
  } | null> {
    if (typeof this.redisService?.get !== 'function') return null;
    const key = `mindauth:oauth-introspection:${hashMindAuthBearer(accessToken)}`;
    try {
      const value = await this.redisService.get(key);
      if (!value) return null;
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (parsed?.token?.active !== true || !parsed.token.sub || !parsed.token.client_id
        || !Number.isSafeInteger(parsed.identity?.id)) return null;
      if (parsed.token.exp && Number(parsed.token.exp) <= Math.floor(Date.now() / 1000)) {
        await this.redisService.del(key).catch(() => undefined);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeMindAuthBearerCache(accessToken: string, token: any, identity: Awaited<ReturnType<AuthService['getUserInfo']>>): Promise<void> {
    if (typeof this.redisService?.set !== 'function') return;
    const key = `mindauth:oauth-introspection:${hashMindAuthBearer(accessToken)}`;
    const value = {
      token: {
        active: token.active === true,
        sub: String(token.sub),
        client_id: String(token.client_id),
        scope: String(token.scope || ''),
        ...(token.client_type ? { client_type: token.client_type } : {}),
        ...(token.party_type ? { party_type: token.party_type } : {}),
        ...(Number.isFinite(Number(token.exp)) ? { exp: Number(token.exp) } : {}),
      },
      identity: {
        id: identity.id,
        username: identity.username,
        email: identity.email,
        avatar_url: identity.avatar_url,
        phone_verified: identity.phone_verified,
        phone_verified_at: identity.phone_verified_at,
        email_verified: identity.email_verified,
        preferred_locale: identity.preferred_locale,
      },
    };
    try {
      await this.redisService.set(key, JSON.stringify(value), MINDAUTH_OAUTH_CACHE_TTL_SECONDS);
    } catch {
      // Cache failure must not turn a valid MindAuth bearer into an API error.
    }
  }

  private async introspectMindAuthToken(accessToken: string): Promise<any> {
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');
    const clientId = this.configService.get<string>('MINDAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('MINDAUTH_CLIENT_SECRET');
    if (!mindauthUrl || !clientId || !clientSecret) throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: '认证服务未配置' });
    const response = await mindAuthHttp.post(joinMindAuthApiUrl(mindauthUrl, '/introspect'), {
      token: accessToken, client_id: clientId, client_secret: clientSecret,
    });
    return response.data;
  }

  async listMobileSessions(userId: number) { return this.mobileSessionRepository.find({ where: { user_id: userId }, order: { created_at: 'DESC' }, select: ['id', 'device_name', 'ip_address', 'last_seen_at', 'created_at', 'revoked_at'] }); }
  async revokeMobileSession(userId: number, sessionId: string): Promise<void> { const result = await this.mobileSessionRepository.update({ id: sessionId, user_id: userId, revoked_at: IsNull() }, { revoked_at: new Date() }); if (!result.affected) throw new UnauthorizedException({ code: 'SESSION_NOT_FOUND', message: '设备会话不存在或已撤销' }); await this.mobileRefreshTokenRepository.update({ session_id: sessionId, revoked_at: IsNull() }, { revoked_at: new Date() }); }
  async logoutMobileSession(userId: number, sessionId: string): Promise<void> { await this.revokeMobileSession(userId, sessionId); await this.writeMobileAudit(userId, sessionId, 'mobile_logout'); }

  private async issueMobileRefreshToken(sessionId: string, familyId: string): Promise<{ id: string; raw: string }> {
    const raw = crypto.randomBytes(48).toString('base64url'); const id = crypto.randomUUID();
    await this.mobileRefreshTokenRepository.save(this.mobileRefreshTokenRepository.create({ id, session_id: sessionId, family_id: familyId, token_hash: this.hashMobileRefreshToken(raw), replaced_by_id: null, revoked_at: null, expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) }));
    return { id, raw };
  }
  private hashMobileRefreshToken(token: string): string { return crypto.createHmac('sha256', this.configService.get<string>('mobileAuth.refreshHmacSecret') || 'development-only-mobile-refresh-secret').update(token).digest('hex'); }
  private async mobileTokenResponse(user: User, session: MobileSession, refreshToken: string) { const accessToken = await this.jwtService.signAsync({ sub: user.id, sid: session.id }, { secret: this.configService.get<string>('mobileAuth.jwtSecret') || 'development-only-mobile-auth-secret', audience: this.configService.get<string>('mobileAuth.audience') || 'android', issuer: this.configService.get<string>('mobileAuth.issuer'), expiresIn: '30m', jwtid: crypto.randomUUID() }); return { access_token: accessToken, access_token_expires_in: 1800, refresh_token: refreshToken, refresh_token_expires_in: 7776000, token_type: 'Bearer', session: { id: session.id, device_name: session.device_name, created_at: session.created_at }, user: toMobileAuthUser(user) }; }
  private extractBearerToken(request: any): string | undefined { const [type, token] = request.headers.authorization?.split(' ') ?? []; return type === 'Bearer' ? token : undefined; }
  private async writeMobileAudit(userId: number, sessionId: string, action: string, ip?: string) { await this.sessionAuditRepository.save(this.sessionAuditRepository.create({ user_id: userId, session_token: hashSessionToken(sessionId), action, ...(ip ? { ip_address: ip } : {}) })); }

  /**
   * Get user info from MindAuth using access token
   */
  async getUserInfo(accessToken: string): Promise<{
    id: number;
    username: string;
    email?: string | null;
    email_verified?: boolean;
    avatar_url: string;
    phone_verified?: boolean;
    phone_verified_at?: string | Date | null;
    preferred_locale?: string | null;
  }> {
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');

    try {
      const response = await mindAuthHttp.get(joinMindAuthApiUrl(mindauthUrl, '/userinfo'), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return {
        id: Number(response.data.id ?? response.data.sub),
        username: response.data.username ?? response.data.name,
        email: response.data.email || null,
        email_verified: normalizeVerificationFlag(response.data.email_verified),
        avatar_url: response.data.avatar_url,
        phone_verified: normalizeVerificationFlag(response.data.phone_verified),
        phone_verified_at: response.data.phone_verified_at ?? null,
        preferred_locale: response.data.preferred_locale || null,
      };
    } catch (error) {
      try {
        const response = await mindAuthHttp.get(joinMindAuthApiUrl(mindauthUrl, '/user'), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        return {
          id: Number(response.data.id ?? response.data.sub),
          username: response.data.username ?? response.data.name,
          email: response.data.email || null,
          email_verified: normalizeVerificationFlag(response.data.email_verified),
          avatar_url: response.data.avatar_url,
          phone_verified: normalizeVerificationFlag(response.data.phone_verified),
          phone_verified_at: response.data.phone_verified_at ?? null,
          preferred_locale: response.data.preferred_locale || null,
        };
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
    email?: string | null;
    email_verified?: boolean;
    avatar_url: string;
    phone_verified?: boolean;
    phone_verified_at?: string | Date | null;
    preferred_locale?: string | null;
  }): Promise<User> {
    const normalizedEmailVerified = normalizeVerificationFlag(mindauthUser.email_verified);
    const normalizedPhoneVerified = normalizeVerificationFlag(mindauthUser.phone_verified);

    let user = await this.usersRepository.findOne({
      where: { mindauth_id: mindauthUser.id },
    });

    if (!user) {
      // Download avatar from MindAuth to local disk for new users
      const localAvatarUrl = mindauthUser.avatar_url
        ? await this.syncAvatarFromMindAuth(mindauthUser.avatar_url, mindauthUser.id)
        : undefined;

      user = this.usersRepository.create({
        mindauth_id: mindauthUser.id,
        username: mindauthUser.username,
        email: mindauthUser.email || null,
        email_verified: normalizedEmailVerified ?? false,
        avatar_url: localAvatarUrl,
        role: 'user',
        phone_verified: normalizedPhoneVerified ?? false,
        phone_verified_at: mindauthUser.phone_verified_at ? new Date(mindauthUser.phone_verified_at) : null,
        preferred_locale: mindauthUser.preferred_locale || null,
      });
      await this.usersRepository.save(user);
      this.notificationsService.sendWelcomeNotification(user.id).catch((error) => {
        console.error('Failed to send welcome notification:', error);
      });
    } else {
      // Update user info if changed
      if (mindauthUser.username) user.username = mindauthUser.username;
      if (mindauthUser.email) user.email = mindauthUser.email;
      if (normalizedEmailVerified !== undefined) user.email_verified = normalizedEmailVerified;
      if (mindauthUser.preferred_locale) user.preferred_locale = mindauthUser.preferred_locale;
      if (mindauthUser.avatar_url) {
        // Content-addressed storage reuses the URL when the image is unchanged.
        user.avatar_url = await this.syncAvatarFromMindAuth(
          mindauthUser.avatar_url,
          mindauthUser.id,
        );
      }
      if (normalizedPhoneVerified !== undefined) {
        user.phone_verified = normalizedPhoneVerified;
        if (!normalizedPhoneVerified) user.phone_verified_at = null;
      }
      if (mindauthUser.phone_verified_at) {
        user.phone_verified_at = new Date(mindauthUser.phone_verified_at);
      }
      await this.usersRepository.save(user);
    }

    return user;
  }

  /**
   * Validate username/password via MindAuth service-to-service API
   * Returns user if valid, null if invalid
   */
  async validateUsernamePassword(username: string, password: string): Promise<User | null> {
    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');
    const serviceApiKey = this.configService.get<string>('MINDAUTH_SERVICE_API_KEY');

    if (!mindauthUrl || !serviceApiKey) {
      this.logger.warn('MindAuth URL or service API key not configured');
      return null;
    }

    try {
      const response = await mindAuthHttp.post(
        joinMindAuthApiUrl(mindauthUrl, '/service/validate-credentials'),
        { username, password },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Service-API-Key': serviceApiKey,
          },
        }
      );

      if (!response.data?.valid || !response.data?.user) {
        return null;
      }

      // Find or create local user based on MindAuth user data
      const mindauthUser = {
        id: response.data.user.id,
        username: response.data.user.username,
        email: response.data.user.email,
        email_verified: normalizeVerificationFlag(response.data.user.email_verified),
        avatar_url: response.data.user.avatar_url || '',
        phone_verified: normalizeVerificationFlag(response.data.user.phone_verified),
        phone_verified_at: response.data.user.phone_verified_at,
      };

      return await this.getOrCreateUser(mindauthUser);
    } catch (error) {
      if (error.response?.status === 401) {
        return null; // Invalid credentials
      }
      this.logger.error(`MindAuth validation failed: ${error.message}`);
      throw new Error('认证服务暂时不可用');
    }
  }

  async syncMindAuthUserData(mindauthUser: {
    id?: number;
    mindauth_id?: number;
    username?: string;
    email?: string | null;
    email_verified?: boolean;
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
    if (typeof mindauthUser.email_verified === 'boolean') {
      user.email_verified = mindauthUser.email_verified;
    }
    if (mindauthUser.avatar_url) {
      user.avatar_url = await this.syncAvatarFromMindAuth(
        mindauthUser.avatar_url,
        mindauthId,
      );
    }
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

  async refreshUserFromMindAuthWithToken(user: User, accessToken: string, refreshToken?: string, force = false, sessionKey?: string): Promise<User> {
    const cooldownKey = `mindauth:user-refresh:${user.id}`;
    const alreadyClaimed = !force && !(await this.redisService.acquireCooldown(cooldownKey, MINDAUTH_REFRESH_COOLDOWN_SECONDS, String(user.id)));
    if (alreadyClaimed) {
      return user;
    }

    try {
      const mindauthUser = await this.getUserInfo(accessToken);
      const updated = await this.syncMindAuthUserData(mindauthUser);
      return updated ?? user;
    } catch {
      // Access token may be expired — try refreshing with refresh token
      if (refreshToken) {
        try {
          const newTokens = await this.refreshAccessToken(refreshToken, sessionKey);
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

  async syncPhoneStatusFromSession(sessionToken: string): Promise<User> {
    const sessionKey = `session:${sessionToken}`;
    const sessionData = await this.redisService.hgetall(sessionKey);

    if (!sessionData || !sessionData.userId) {
      throw new UnauthorizedException({
        code: 'PHONE_SYNC_RELOGIN_REQUIRED',
        message: '论坛登录状态已失效，请重新登录后再同步手机号',
      });
    }

    const userId = parseInt(sessionData.userId, 10);
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException({
        code: 'PHONE_SYNC_RELOGIN_REQUIRED',
        message: '论坛登录状态已失效，请重新登录后再同步手机号',
      });
    }

    const accessToken = sessionData.accessToken;
    const refreshToken = sessionData.refreshToken;
    if (!accessToken) {
      throw new UnauthorizedException({
        code: 'PHONE_SYNC_RELOGIN_REQUIRED',
        message: '论坛登录状态缺少认证中心令牌，请重新登录后再同步手机号',
      });
    }

    const mindauthUser = await this.getUserInfoForPhoneSync(accessToken, refreshToken, sessionKey);
    const updated = await this.syncMindAuthUserData(mindauthUser);
    if (!updated) {
      throw new HttpException(
        {
          code: 'PHONE_SYNC_FAILED',
          message: '手机号已验证，但论坛状态同步失败，请稍后重试',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!updated.phone_verified) {
      throw new HttpException(
        {
          code: 'PHONE_NOT_VERIFIED_AFTER_SYNC',
          message: '认证中心手机号状态尚未刷新，请稍后重试',
        },
        HttpStatus.CONFLICT,
      );
    }

    return updated;
  }

  private async getUserInfoForPhoneSync(accessToken: string, refreshToken?: string, sessionKey?: string): Promise<{
    id: number;
    username: string;
    email?: string | null;
    email_verified?: boolean;
    avatar_url: string;
    phone_verified?: boolean;
    phone_verified_at?: string | Date | null;
  }> {
    try {
      return await this.getUserInfo(accessToken);
    } catch {
      if (!refreshToken) {
        throw new UnauthorizedException({
          code: 'PHONE_SYNC_RELOGIN_REQUIRED',
          message: '认证中心登录状态已失效，请重新登录后再同步手机号',
        });
      }

      try {
        const newTokens = await this.refreshAccessToken(refreshToken, sessionKey);
        return await this.getUserInfo(newTokens.accessToken);
      } catch {
        throw new UnauthorizedException({
          code: 'PHONE_SYNC_RELOGIN_REQUIRED',
          message: '认证中心登录状态已失效，请重新登录后再同步手机号',
        });
      }
    }
  }

  /**
   * Refresh OAuth access token using refresh token
   */
  private async refreshAccessToken(refreshToken: string, sessionKey?: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (!sessionKey) {
      throw new Error('MindAuth refresh requires the owning forum session to persist an Idempotency-Key');
    }

    const pending = await this.redisService.eval(
      BEGIN_MINDAUTH_REFRESH_SCRIPT,
      [sessionKey],
      [refreshToken, crypto.randomUUID()],
    ) as string[];
    const pendingState = String(pending?.[0] || '');
    if (pendingState === 'ROTATED') {
      const accessToken = String(pending?.[1] || '');
      const currentRefreshToken = String(pending?.[2] || '');
      if (!accessToken || !currentRefreshToken) {
        throw new Error('MindAuth refresh session changed without a complete replacement token pair');
      }
      return { accessToken, refreshToken: currentRefreshToken };
    }
    if (pendingState !== 'READY' || !pending?.[1]) {
      throw new Error('MindAuth refresh already has an inconsistent pending attempt; refusing an unkeyed retry');
    }
    const idempotencyKey = String(pending[1]);

    const mindauthUrl = this.configService.get<string>('MINDAUTH_URL');
    const clientId = this.configService.get<string>('MINDAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('MINDAUTH_CLIENT_SECRET');

    const response = await mindAuthHttp.post(joinMindAuthApiUrl(mindauthUrl, '/token'), {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }, { headers: { 'Idempotency-Key': idempotencyKey } });

    const accessToken = response.data?.access_token;
    const nextRefreshToken = response.data?.refresh_token;
    if (typeof accessToken !== 'string' || !accessToken || typeof nextRefreshToken !== 'string' || !nextRefreshToken) {
      // Keep the pending request identity. A retry with the old token and this
      // key can recover a response even if the server already rotated it.
      throw new Error('MindAuth refresh response did not include both tokens');
    }

    const saved = await this.redisService.eval(
      COMPLETE_MINDAUTH_REFRESH_SCRIPT,
      [sessionKey],
      [refreshToken, accessToken, nextRefreshToken, idempotencyKey],
    );
    if (Number(saved) !== 1) {
      // Do not clear the pending key or issue another refresh under a new key.
      throw new Error('MindAuth refresh succeeded but its token pair could not be committed to the forum session');
    }

    return {
      accessToken,
      refreshToken: nextRefreshToken,
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
      session_token: hashSessionToken(sessionToken),
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

  async verifySession(sessionToken: string): Promise<User | null> {
    const sessionKey = `session:${sessionToken}`;
    if (!sessionToken) return null;
    const sessionData = await this.redisService.readSessionAndRenew(sessionKey, this.sessionTtl);

    if (!sessionData || !sessionData.userId) {
      return null;
    }

    const userId = parseInt(sessionData.userId, 10);
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) return null;

    const accessToken = sessionData.accessToken;
    const refreshToken = sessionData.refreshToken;
    if (accessToken) {
      return this.refreshUserFromMindAuthWithToken(user, accessToken, refreshToken, false, sessionKey);
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
        session_token: hashSessionToken(sessionToken),
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
      await mindAuthHttp.post(joinMindAuthApiUrl(mindauthUrl, '/revoke'), {
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

  // ---------- Terms & Conditions acceptance ----------

  /**
   * Decide whether a user must accept (or re-accept) the forum Terms / Privacy
   * before being allowed to use the forum.
   *
   * Returns true when the admin has enabled `terms_required` and the user has
   * not accepted the exact current pair of legal documents. Versions are derived
   * from their SHA-256 content hashes, so editing either page automatically asks
   * for a fresh acceptance without a second manual version setting.
   */
  async checkNeedsTermsAcceptance(user: User): Promise<boolean> {
    const required = await this.settingsService.getBoolean('terms_required', false);
    if (!required) return false;

    const latest = await this.legalAcceptanceRepository.findOne({
      where: { user_id: user.id },
      order: { accepted_at: 'DESC' },
    });
    if (!latest) return true;

    const snapshot = await this.getLegalDocumentSnapshot();
    return latest.terms_content_hash !== snapshot.termsHash
      || latest.privacy_content_hash !== snapshot.privacyHash;
  }

  /**
   * Stash a "pending terms acceptance" payload in Redis during the MindAuth
   * callback redirect dance. The frontend /accept-terms page trades the token
   * back via POST /auth/accept-terms.
   */
  async storePendingTermsAcceptance(
    token: string,
    payload: PendingTermsPayload,
  ): Promise<void> {
    await this.redisService.set(
      `pending_terms:${token}`,
      JSON.stringify(payload),
      10 * 60, // 10 minutes
    );
  }

  /**
   * Atomically consume a pending terms-acceptance payload. Returns null when
   * the token is unknown, expired, or already used.
   */
  async consumePendingTermsAcceptance(token: string): Promise<PendingTermsPayload | null> {
    const key = `pending_terms:${token}`;
    const raw = await this.redisService.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      [key],
      [],
    ) as string | null;
    if (!raw) return null;

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!value || typeof value !== 'object') return null;
    const payload = value as Record<string, unknown>;
    const oauthTokens = payload.oauthTokens;
    const oauth = oauthTokens && typeof oauthTokens === 'object'
      ? oauthTokens as Record<string, unknown>
      : null;
    const redirectPath = payload.redirectPath;
    const clientIp = payload.clientIp;
    if (
      !Number.isInteger(payload.userId) ||
      (payload.userId as number) <= 0 ||
      typeof redirectPath !== 'string' ||
      !redirectPath.startsWith('/') ||
      redirectPath.startsWith('//') ||
      redirectPath.includes('\\') ||
      typeof clientIp !== 'string' ||
      !oauth ||
      typeof oauth.accessToken !== 'string' ||
      oauth.accessToken.length === 0 ||
      (oauth.refreshToken !== undefined && typeof oauth.refreshToken !== 'string')
    ) {
      return null;
    }

    return {
      userId: payload.userId as number,
      redirectPath,
      clientIp,
      oauthTokens: {
        accessToken: oauth.accessToken,
        ...(oauth.refreshToken === undefined ? {} : { refreshToken: oauth.refreshToken }),
      },
    };
  }

  /**
   * Record that the user has accepted the current Terms/Privacy revision.
   */
  private async getLegalDocumentSnapshot(): Promise<{
    termsHash: string;
    privacyHash: string;
  }> {
    const [termsContent, privacyContent] = await Promise.all([
      this.settingsService.get('footer_terms_content'),
      this.settingsService.get('footer_privacy_content'),
    ]);
    return {
      termsHash: crypto.createHash('sha256').update(termsContent || '').digest('hex'),
      privacyHash: crypto.createHash('sha256').update(privacyContent || '').digest('hex'),
    };
  }

  async recordTermsAcceptance(userId: number, context: LegalAcceptanceContext = {}): Promise<void> {
    const { termsHash, privacyHash } = await this.getLegalDocumentSnapshot();
    const acceptedAt = new Date();

    await this.legalAcceptanceRepository.manager.transaction(async (manager) => {
      await manager.getRepository(LegalAcceptance).insert({
        user_id: userId,
        terms_version: `sha256:${termsHash}`,
        terms_content_hash: termsHash,
        privacy_version: `sha256:${privacyHash}`,
        privacy_content_hash: privacyHash,
        ip_address: context.clientIp || null,
        user_agent: context.userAgent || null,
        accepted_at: acceptedAt,
      });
      await manager.getRepository(User).update(userId, { terms_accepted_at: acceptedAt });
    });
  }
}
