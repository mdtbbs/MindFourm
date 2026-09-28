import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { RedisService } from '../../database/redis.service';

const BUILTIN_HIGH_RISK_TERMS = ['博彩', '裸聊', '刷单', '勒索', '木马', '代开'];
const DEFAULT_LINK_REVIEW_THRESHOLD = 8;
const DEFAULT_DUPLICATE_WINDOW_SECONDS = 120;
const DEFAULT_DUPLICATE_MIN_CHARACTERS = 40;

export type ContentRisk = { score: number; rules: string[]; mustReview: boolean };
export type ContentRiskContext = { actorId?: number; surface?: 'post' | 'reply' | 'resource' };

@Injectable()
export class ContentSafetyService {
  constructor(
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async assess(text: string | undefined | null, context: ContentRiskContext = {}): Promise<ContentRisk> {
    const value = String(text || '');
    const configured = (await this.settings.get('content_safety_keywords') || '')
      .split(/[\n,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 200);
    const terms = [...new Set([...BUILTIN_HIGH_RISK_TERMS, ...configured])];
    const rules: string[] = [];
    const matches = terms.filter((term) => value.toLowerCase().includes(term.toLowerCase()));
    if (matches.length) rules.push(`keyword:${matches.slice(0, 5).join('|')}`);
    const links = value.match(/https?:\/\/[^\s<>()]+/gi)?.length || 0;
    const configuredLinkThreshold = await this.settings.getNumber('content_safety_link_review_threshold');
    const linkThreshold = Math.min(50, Math.max(1, configuredLinkThreshold || DEFAULT_LINK_REVIEW_THRESHOLD));
    const excessiveLinks = links >= linkThreshold;
    if (excessiveLinks) rules.push('excessive_links');
    const repeatedCharacters = /(.)\1{19,}/u.test(value);
    if (repeatedCharacters) rules.push('repeated_characters');

    const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
    const minDuplicateLength = Math.min(2000, Math.max(1,
      await this.settings.getNumber('content_safety_duplicate_min_characters') || DEFAULT_DUPLICATE_MIN_CHARACTERS,
    ));
    const duplicateWindow = Math.min(3600, Math.max(10,
      await this.settings.getNumber('content_safety_duplicate_window_seconds') || DEFAULT_DUPLICATE_WINDOW_SECONDS,
    ));
    let duplicateRecent = false;
    if (this.redis && context.actorId && normalized.length >= minDuplicateLength) {
      const fingerprint = createHash('sha256').update(normalized).digest('hex');
      const scope = context.surface || 'community';
      duplicateRecent = !(await this.redis.setIfNotExists(
        `content-safety:recent:${scope}:${context.actorId}:${fingerprint}`,
        '1',
        duplicateWindow,
      ));
      if (duplicateRecent) rules.push('duplicate_recent');
    }

    // Repeated submissions are held for review rather than hard-rejected. This
    // catches accidental retry storms and simple spam without adding a CAPTCHA
    // step to ordinary posting. The risk result remains the extension point for
    // a future challenge provider.
    const score = matches.length * 3 + (excessiveLinks ? 2 : 0)
      + (repeatedCharacters ? 2 : 0) + (duplicateRecent ? 3 : 0);
    const threshold = Math.max(1, await this.settings.getNumber('content_safety_review_threshold') || 3);
    return { score, rules, mustReview: score >= threshold };
  }

  async recordFlag(input: { userId: number; targetType: string; targetId: number; risk: ContentRisk; ipAddress?: string }): Promise<void> {
    if (!input.risk.mustReview) return;
    await this.logs.log({
      user_id: input.userId,
      action: 'content_safety.flagged',
      target_type: input.targetType,
      target_id: input.targetId,
      details: JSON.stringify({ score: input.risk.score, rules: input.risk.rules, outcome: 'pending_review' }),
      ip_address: input.ipAddress,
    });
  }
}
