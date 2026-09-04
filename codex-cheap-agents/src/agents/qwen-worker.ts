import type { AgentProvider } from '../providers/types.js';
import { parseModelJson, asStringArray } from '../utils/json.js';
import { QWEN_WORKER_PROMPT } from '../prompts/qwen-worker.js';

export interface WorkerResult {
  status: 'success' | 'failed' | 'escalate'; summary: string; rootCause?: string; changedFiles: string[]; patch?: string;
  validation: { status: 'passed' | 'failed' | 'not_run'; summary: string; log: string }; risks: string[]; confidence: string;
  needsSol: boolean; reason?: string; question?: string; options?: string[];
  providerRequests: number; inputTokens?: number; outputTokens?: number;
}
export class QwenWorker {
  constructor(private readonly provider: AgentProvider, private readonly timeoutMs: number) {}
  async run(task: string, mode: string, context: string, feedback?: unknown): Promise<WorkerResult> {
    let response = await this.provider.invoke({ system: QWEN_WORKER_PROMPT, timeoutMs: this.timeoutMs, responseFormat: 'json', prompt:
      `TASK: ${task}\nMODE: ${mode}\n${feedback ? `REVIEW FEEDBACK: ${JSON.stringify(feedback)}\n` : ''}REPOSITORY CONTEXT:\n${context}` });
    let providerRequests = 1;
    let raw: Record<string, unknown>;
    try { raw = parseModelJson<Record<string, unknown>>(response.content); }
    catch {
      response = await this.provider.invoke({ system: 'Repair the following into one valid JSON object only. Do not add commentary or change its intended meaning.', timeoutMs: this.timeoutMs, responseFormat: 'json', prompt: response.content.slice(0, 24_000) });
      providerRequests += 1;
      raw = parseModelJson<Record<string, unknown>>(response.content);
    }
    const status = raw.status === 'escalate' ? 'escalate' : raw.status === 'failed' ? 'failed' : 'success';
    return { status, summary: typeof raw.summary === 'string' ? raw.summary : 'Worker completed without a summary.', rootCause: typeof raw.root_cause === 'string' ? raw.root_cause : undefined,
      changedFiles: asStringArray(raw.changed_files), patch: typeof raw.patch === 'string' ? raw.patch : undefined,
      validation: { status: raw.validation && typeof raw.validation === 'object' && (raw.validation as Record<string, unknown>).status === 'failed' ? 'failed' : raw.validation && typeof raw.validation === 'object' && (raw.validation as Record<string, unknown>).status === 'passed' ? 'passed' : 'not_run', summary: raw.validation && typeof raw.validation === 'object' && typeof (raw.validation as Record<string, unknown>).summary === 'string' ? (raw.validation as Record<string, unknown>).summary as string : 'Not reported', log: '' },
      risks: asStringArray(raw.risks), confidence: typeof raw.confidence === 'string' ? raw.confidence : 'medium', needsSol: raw.needs_sol === true,
      reason: typeof raw.reason === 'string' ? raw.reason : undefined, question: typeof raw.question === 'string' ? raw.question : undefined, options: asStringArray(raw.options), providerRequests,
      inputTokens: response.usage?.inputTokens, outputTokens: response.usage?.outputTokens };
  }
}
