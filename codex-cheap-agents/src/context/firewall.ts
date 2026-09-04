import { clean, compactList } from './compressor.js';
import type { ArtifactRef } from '../artifacts/types.js';

export interface FirewallInput {
  status: 'success' | 'failed' | 'escalate'; summary?: unknown; rootCause?: unknown; changedFiles?: unknown;
  validation?: { status?: unknown; summary?: unknown }; risks?: unknown; confidence?: unknown; needsSol?: boolean;
  reason?: unknown; question?: unknown; options?: unknown; review?: { verdict?: unknown; summary?: unknown; remainingRisks?: unknown };
}

export class ContextFirewall {
  constructor(private readonly defaultTokenLimit = 600, private readonly complexTokenLimit = 1200) {}
  summarize(input: FirewallInput, artifact: ArtifactRef, complex = false): Record<string, unknown> {
    const result: Record<string, unknown> = {
      status: input.status, summary: clean(input.summary, 360), root_cause: clean(input.rootCause, 280) || undefined,
      changed_files: compactList(input.changedFiles), validation: { status: clean(input.validation?.status, 30) || 'not_run', summary: clean(input.validation?.summary, 160) },
      review: input.review ? { verdict: clean(input.review.verdict, 30), summary: clean(input.review.summary, 220) } : undefined,
      risks: compactList(input.risks), confidence: clean(input.confidence, 20) || 'medium', needs_sol: Boolean(input.needsSol),
      artifacts: artifact,
    };
    if (input.needsSol) Object.assign(result, { reason: clean(input.reason, 280), question: clean(input.question, 280), options: compactList(input.options, 3) });
    if (input.review?.remainingRisks) result.remaining_risks = compactList(input.review.remainingRisks);
    return this.limit(result, complex ? this.complexTokenLimit : this.defaultTokenLimit);
  }
  private limit(result: Record<string, unknown>, tokens: number): Record<string, unknown> {
    const limit = tokens * 4;
    let encoded = JSON.stringify(result);
    if (encoded.length <= limit) return result;
    result.risks = []; result.remaining_risks = [];
    encoded = JSON.stringify(result);
    if (encoded.length > limit) result.summary = clean(result.summary, Math.max(80, limit - 600));
    return result;
  }
}
