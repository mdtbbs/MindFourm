import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { ApiV1Exception } from '../../common/exceptions/api-v1.exception';
import { RedisService } from '../../database/redis.service';
import { SettingsService } from '../settings/settings.service';

export type CommunityChallengeAction =
  | 'forum.post.create'
  | 'forum.reply.create'
  | 'forum.auth.login'
  | 'forum.auth.register';

export type CommunityChallengeProof = { token?: string; response?: string };

type ProviderIssue = { publicData: Record<string, unknown>; expectedResponse?: string };
type ProviderContext = { action: CommunityChallengeAction; response: string; expectedResponse?: string; remoteIp?: string };

interface ChallengeProvider {
  readonly id: 'disabled' | 'development' | 'turnstile' | 'hcaptcha';
  issue(): ProviderIssue;
  verify(input: ProviderContext): Promise<boolean>;
}

type Ticket = {
  action: CommunityChallengeAction;
  actorId: number | null;
  provider: ChallengeProvider['id'];
  expectedResponse?: string;
  expiresAt: number;
};

const TOKEN_PREFIX = 'forumch_v1_';
const TOKEN_TTL_SECONDS = 180;
const REPEAT_POST_WINDOW_SECONDS = 120;
const REPEAT_POST_MIN_CHARACTERS = 24;
const MIN_LINK_COUNT = 4;
const LINK_DENSITY_PER_1000 = 8;
const REPLY_WINDOW_SECONDS = 60;
const REPLY_COUNT_THRESHOLD = 5;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function safeEquals(actual: string, expected: string): boolean {
  return timingSafeEqual(digest(actual), digest(expected));
}

class DisabledProvider implements ChallengeProvider {
  readonly id = 'disabled' as const;
  issue(): ProviderIssue { return { publicData: {} }; }
  async verify(): Promise<boolean> { return false; }
}

class DevelopmentProvider implements ChallengeProvider {
  readonly id = 'development' as const;

  issue(): ProviderIssue {
    const left = randomInt(2, 10);
    const right = randomInt(2, 10);
    return { publicData: { left, right }, expectedResponse: String(left + right) };
  }

  async verify(input: ProviderContext): Promise<boolean> {
    return Boolean(input.response && input.expectedResponse && safeEquals(input.response.trim(), input.expectedResponse));
  }
}

class RemoteSiteVerifyProvider implements ChallengeProvider {
  constructor(
    readonly id: 'turnstile' | 'hcaptcha',
    private readonly siteKey: string,
    private readonly secret: string,
  ) {}

  issue(): ProviderIssue {
    return { publicData: { site_key: this.siteKey } };
  }

  async verify(input: ProviderContext): Promise<boolean> {
    if (!input.response || !this.secret) return false;
    const body = new URLSearchParams({ secret: this.secret, response: input.response });
    if (input.remoteIp) body.set('remoteip', input.remoteIp);
    const endpoint = this.id === 'turnstile'
      ? 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
      : 'https://api.hcaptcha.com/siteverify';
    const response = await fetch(endpoint, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Challenge provider returned HTTP ${response.status}`);
    const result = await response.json() as { success?: boolean; action?: string };
    if (!result.success) return false;
    return this.id !== 'turnstile' || result.action === input.action.replaceAll('.', '_');
  }
}

@Injectable()
export class CommunityChallengeService {
  private readonly provider: ChallengeProvider;
  private readonly ticketTtlSeconds: number;

  constructor(
    config: ConfigService,
    private readonly settings: SettingsService,
    private readonly redis: RedisService,
  ) {
    const providerName = String(config.get('communityChallenge.provider') || process.env.COMMUNITY_CHALLENGE_PROVIDER || 'disabled').toLowerCase();
    const environment = String(config.get('app.env') || process.env.NODE_ENV || 'development');
    if (providerName === 'development') {
      if (environment === 'production') throw new Error('The development challenge provider cannot run in production.');
      this.provider = new DevelopmentProvider();
    } else if (providerName === 'turnstile' || providerName === 'hcaptcha') {
      const prefix = providerName === 'turnstile' ? 'COMMUNITY_CHALLENGE_TURNSTILE' : 'COMMUNITY_CHALLENGE_HCAPTCHA';
      const siteKey = String(config.get(`communityChallenge.${providerName}.siteKey`) || process.env[`${prefix}_SITE_KEY`] || '');
      const secret = String(config.get(`communityChallenge.${providerName}.secretKey`) || process.env[`${prefix}_SECRET_KEY`] || '');
      if (!siteKey || !secret) throw new Error(`Both ${prefix}_SITE_KEY and ${prefix}_SECRET_KEY are required.`);
      this.provider = new RemoteSiteVerifyProvider(providerName, siteKey, secret);
    } else if (providerName === 'disabled') {
      this.provider = new DisabledProvider();
    } else {
      throw new Error('COMMUNITY_CHALLENGE_PROVIDER must be disabled, development, turnstile, or hcaptcha.');
    }

    const configuredTtl = Number(config.get('communityChallenge.ticketTtlSeconds') || process.env.COMMUNITY_CHALLENGE_TICKET_TTL_SECONDS || TOKEN_TTL_SECONDS);
    this.ticketTtlSeconds = Number.isFinite(configuredTtl) ? Math.min(600, Math.max(30, Math.trunc(configuredTtl))) : TOKEN_TTL_SECONDS;
  }

  async enforceContentAction(input: {
    action: 'forum.post.create' | 'forum.reply.create';
    text: string;
    actorId: number;
    remoteIp?: string;
    proof?: CommunityChallengeProof;
  }): Promise<void> {
    const token = input.proof?.token?.trim();
    if (this.provider.id === 'disabled' && !token) return;
    const triggerRules = await this.evaluateRisk(input.action, input.text, input.actorId);
    if (!token) {
      if (triggerRules.length) await this.throwRequired(input.action, input.actorId);
      return;
    }

    const ticket = await this.consumeTicket(token);
    if (!ticket) throw new ApiV1Exception('CHALLENGE_EXPIRED', HttpStatus.GONE, '挑战已过期或已使用，请重新提交。');
    if (ticket.action !== input.action || ticket.actorId !== input.actorId || ticket.provider !== this.provider.id) {
      throw new ApiV1Exception('CHALLENGE_INVALID', HttpStatus.BAD_REQUEST, '挑战凭证与当前操作不匹配。');
    }
    let verified = false;
    try {
      verified = await this.provider.verify({
        action: ticket.action,
        response: String(input.proof?.response || ''),
        expectedResponse: ticket.expectedResponse,
        remoteIp: input.remoteIp,
      });
    } catch {
      throw new ApiV1Exception('CHALLENGE_PROVIDER_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '挑战验证暂时不可用，请稍后重试。', true);
    }
    if (!verified) throw new ApiV1Exception('CHALLENGE_INVALID', HttpStatus.BAD_REQUEST, '挑战验证未通过，请重新提交。');
    // A valid ticket is consumed even if this retry no longer matches a risk rule.
  }

  private async evaluateRisk(action: 'forum.post.create' | 'forum.reply.create', text: string, actorId: number): Promise<string[]> {
    const normalized = String(text || '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
    const rules: string[] = [];
    if (action === 'forum.post.create' && normalized.length >= REPEAT_POST_MIN_CHARACTERS
      && await this.settings.getBoolean('community_challenge_repeat_post_enabled', true)) {
      const windowSeconds = await this.settingNumber('community_challenge_repeat_post_window_seconds', REPEAT_POST_WINDOW_SECONDS, 10, 3600);
      const fingerprint = digest(normalized).toString('hex');
      const first = await this.redis.setIfNotExists(`forum:challenge:risk:post:${actorId}:${fingerprint}`, '1', windowSeconds);
      if (!first) rules.push('repeat_post');
    }

    if (action === 'forum.post.create' && await this.settings.getBoolean('community_challenge_link_density_enabled', true)) {
      const links = String(text || '').match(/https?:\/\/[^\s<>()]+/giu)?.length || 0;
      const minimumLinks = await this.settingNumber('community_challenge_link_minimum_count', MIN_LINK_COUNT, 2, 50);
      const perThousand = await this.settingNumber('community_challenge_link_density_per_1000', LINK_DENSITY_PER_1000, 1, 100);
      const density = links * 1000 / Math.max(String(text || '').length, 1);
      if (links >= minimumLinks && density >= perThousand) rules.push('link_density');
    }

    if (action === 'forum.reply.create' && await this.settings.getBoolean('community_challenge_reply_frequency_enabled', true)) {
      const windowSeconds = await this.settingNumber('community_challenge_reply_window_seconds', REPLY_WINDOW_SECONDS, 10, 3600);
      const threshold = await this.settingNumber('community_challenge_reply_count_threshold', REPLY_COUNT_THRESHOLD, 2, 100);
      const count = await this.redis.incrementWithExpiry(`forum:challenge:risk:replies:${actorId}`, windowSeconds);
      if (count >= threshold) rules.push('reply_frequency');
    }
    return rules;
  }

  private async settingNumber(key: string, fallback: number, min: number, max: number): Promise<number> {
    // Read below through SettingsService so a moderator can tune each rule without
    // changing rate limits, review thresholds, or the provider implementation.
    const configured = await this.settings.getNumber(key);
    return Number.isFinite(configured) ? Math.min(max, Math.max(min, Number(configured))) : fallback;
  }

  private async throwRequired(action: CommunityChallengeAction, actorId: number): Promise<never> {
    if (this.provider.id === 'disabled') {
      throw new ApiV1Exception('CHALLENGE_PROVIDER_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '挑战验证当前未启用。', true);
    }
    const issue = this.provider.issue();
    const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const ticket: Ticket = {
      action,
      actorId,
      provider: this.provider.id,
      expectedResponse: issue.expectedResponse,
      expiresAt: Date.now() + this.ticketTtlSeconds * 1000,
    };
    const stored = await this.redis.setIfNotExists(this.ticketKey(token), JSON.stringify(ticket), this.ticketTtlSeconds);
    if (!stored) throw new ApiV1Exception('CHALLENGE_PROVIDER_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '挑战凭证暂时无法创建，请稍后重试。', true);
    const challenge = {
      token,
      action,
      provider: this.provider.id,
      expires_in: this.ticketTtlSeconds,
      ...issue.publicData,
    };
    throw new ApiV1Exception('CHALLENGE_REQUIRED', HttpStatus.PRECONDITION_REQUIRED, '此操作需要完成一次安全验证。', true, [{ challenge }]);
  }

  private async consumeTicket(token: string): Promise<Ticket | null> {
    if (!token.startsWith(TOKEN_PREFIX) || token.length > 128) return null;
    const stored = await this.redis.getAndDelete(this.ticketKey(token));
    if (!stored) return null;
    try {
      const ticket = JSON.parse(stored) as Ticket;
      return ticket.expiresAt > Date.now() ? ticket : null;
    } catch {
      return null;
    }
  }

  private ticketKey(token: string): string {
    return `forum:challenge:ticket:${digest(token).toString('hex')}`;
  }
}
