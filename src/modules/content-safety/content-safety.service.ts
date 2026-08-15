import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';

const BUILTIN_HIGH_RISK_TERMS = ['博彩', '裸聊', '刷单', '勒索', '木马', '代开'];

export type ContentRisk = { score: number; rules: string[]; mustReview: boolean };

@Injectable()
export class ContentSafetyService {
  constructor(private readonly settings: SettingsService, private readonly logs: LogsService) {}

  async assess(text: string | undefined | null): Promise<ContentRisk> {
    const value = String(text || '');
    const configured = (await this.settings.get('content_safety_keywords') || '')
      .split(/[\n,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 200);
    const terms = [...new Set([...BUILTIN_HIGH_RISK_TERMS, ...configured])];
    const rules: string[] = [];
    const matches = terms.filter((term) => value.toLowerCase().includes(term.toLowerCase()));
    if (matches.length) rules.push(`keyword:${matches.slice(0, 5).join('|')}`);
    const links = value.match(/https?:\/\/[^\s<>()]+/gi)?.length || 0;
    if (links >= 8) rules.push('excessive_links');
    if (/(.)\1{19,}/u.test(value)) rules.push('repeated_characters');
    const score = matches.length * 3 + (links >= 8 ? 2 : 0) + (/(.)\1{19,}/u.test(value) ? 2 : 0);
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
