import type { AgentProvider } from '../providers/types.js';
import { parseModelJson, asStringArray } from '../utils/json.js';
import { GLM_REVIEWER_PROMPT } from '../prompts/glm-reviewer.js';

export type ReviewVerdict = 'PASS' | 'PASS_WITH_NOTES' | 'REWORK' | 'ESCALATE';
export interface ReviewResult { verdict: ReviewVerdict; summary: string; issues: unknown[]; validationAssessment: string; remainingRisks: string[]; confidence: string; needsRework: boolean; needsSol: boolean; reason?: string; question?: string; options?: string[]; providerRequests: number; inputTokens?: number; outputTokens?: number; }
export class GlmReviewer {
  constructor(private readonly provider: AgentProvider, private readonly timeoutMs: number) {}
  async run(task: string, worker: unknown, diff: string): Promise<ReviewResult> {
    let response = await this.provider.invoke({ system: GLM_REVIEWER_PROMPT, timeoutMs: this.timeoutMs, responseFormat: 'json', prompt:
      `ORIGINAL TASK: ${task}\nWORKER CLAIM: ${JSON.stringify(worker)}\nTARGETED DIFF (may be empty):\n${diff.slice(0, 50_000)}` });
    let providerRequests = 1;
    let raw: Record<string, unknown>;
    try { raw = parseModelJson<Record<string, unknown>>(response.content); }
    catch {
      response = await this.provider.invoke({ system: 'Repair the following into one valid JSON object only. Do not add commentary or change its intended meaning.', timeoutMs: this.timeoutMs, responseFormat: 'json', prompt: response.content.slice(0, 24_000) });
      providerRequests += 1;
      raw = parseModelJson<Record<string, unknown>>(response.content);
    }
    const verdict: ReviewVerdict = ['PASS', 'PASS_WITH_NOTES', 'REWORK', 'ESCALATE'].includes(raw.verdict as string) ? raw.verdict as ReviewVerdict : 'REWORK';
    return { verdict, summary: typeof raw.summary === 'string' ? raw.summary : 'Reviewer returned no summary.', issues: Array.isArray(raw.issues) ? raw.issues.slice(0, 12) : [], validationAssessment: typeof raw.validation_assessment === 'string' ? raw.validation_assessment : 'insufficient', remainingRisks: asStringArray(raw.remaining_risks), confidence: typeof raw.confidence === 'string' ? raw.confidence : 'medium', needsRework: raw.needs_rework === true || verdict === 'REWORK', needsSol: raw.needs_sol === true || verdict === 'ESCALATE', reason: typeof raw.reason === 'string' ? raw.reason : undefined, question: typeof raw.question === 'string' ? raw.question : undefined, options: asStringArray(raw.options), providerRequests, inputTokens: response.usage?.inputTokens, outputTokens: response.usage?.outputTokens };
  }
}
