import { ArtifactStore } from '../artifacts/store.js';
import type { AppConfig } from '../config/schema.js';
import { ContextBuilder } from '../context/builder.js';
import { ContextFirewall } from '../context/firewall.js';
import { gitDiff, gitPatch } from '../workspace/git.js';
import { applyUnifiedPatch } from '../workspace/patch.js';
import { runSafeValidation } from '../workspace/validation.js';
import { safeWorkspace } from '../workspace/guard.js';
import { QwenWorker, type WorkerResult } from './qwen-worker.js';
import { GlmReviewer, type ReviewResult } from './glm-reviewer.js';

export interface WorkflowDeps { config: AppConfig; worker: QwenWorker; reviewer: GlmReviewer; builder?: ContextBuilder; firewall?: ContextFirewall; }
export class Workflow {
  private readonly builder: ContextBuilder; private readonly firewall: ContextFirewall;
  constructor(private readonly deps: WorkflowDeps) { this.builder = deps.builder ?? new ContextBuilder(); this.firewall = deps.firewall ?? new ContextFirewall(); }
  async investigate(task: string, workspace: string): Promise<Record<string, unknown>> {
    return this.execute(task, workspace, 'investigate', false);
  }
  async review(task: string, workspace: string): Promise<Record<string, unknown>> {
    workspace = await safeWorkspace(workspace);
    const started = Date.now();
    const store = await this.store(task, workspace, 'review', 0);
    const patch = await gitPatch(workspace); const stat = await gitDiff(workspace);
    await store.text('patch.diff', patch); await store.text('agent.log', `Reviewing existing diff.\n${stat}`);
    let review: ReviewResult;
    try { review = await this.deps.reviewer.run(task, { existing_workspace_diff: true }, patch); }
    catch (error) { return this.finish(store, { status: 'failed', summary: 'Reviewer API failed.', validation: { status: 'not_run', summary: 'Not run', log: '' }, risks: [], confidence: 'low', needsSol: true, reason: safeError(error) }, 0, { started, qwenRequests: 0, glmRequests: 1, reworks: 0 }); }
    await store.json('glm-review.json', review);
    return this.finish(store, { status: review.needsSol ? 'escalate' : 'success', summary: review.summary, validation: { status: review.validationAssessment === 'passed' ? 'passed' : 'not_run', summary: review.validationAssessment, log: '' }, risks: review.remainingRisks, confidence: review.confidence, needsSol: review.needsSol, reason: review.reason, question: review.question, options: review.options, review: { verdict: review.verdict, summary: review.summary, remainingRisks: review.remainingRisks } }, 0, { started, qwenRequests: 0, glmRequests: review.providerRequests, reworks: 0, providerInputTokens: review.inputTokens ?? 0, providerOutputTokens: review.outputTokens ?? 0 });
  }
  async execute(task: string, workspace: string, mode: string, withReview: boolean): Promise<Record<string, unknown>> {
    workspace = await safeWorkspace(workspace);
    const started = Date.now(); const context = await this.builder.build(workspace, task); const store = await this.store(task, workspace, mode, context.filesInspected);
    await store.text('context.md', context.text);
    let worker: WorkerResult; let reworks = 0; let qwenRequests = 0; let glmRequests = 0; let providerInputTokens = 0; let providerOutputTokens = 0;
    try { worker = await this.deps.worker.run(task, mode, context.text); qwenRequests += worker.providerRequests; providerInputTokens += worker.inputTokens ?? 0; providerOutputTokens += worker.outputTokens ?? 0; }
    catch (error) { return this.finish(store, failure('Worker API failed.', error), context.filesInspected, { started, qwenRequests, glmRequests, reworks, providerInputTokens, providerOutputTokens }); }
    await store.json('qwen-result.json', worker);
    if (worker.needsSol || worker.status !== 'success') return this.finish(store, worker, context.filesInspected, { started, qwenRequests, glmRequests, reworks, providerInputTokens, providerOutputTokens });
    if (mode !== 'investigate' && worker.patch) {
      try { await applyUnifiedPatch(workspace, worker.patch); await store.text('patch.diff', worker.patch); }
      catch (error) { return this.finish(store, failure('Worker patch was not applied.', error), context.filesInspected, { started, qwenRequests, glmRequests, reworks, providerInputTokens, providerOutputTokens }); }
    }
    if (mode !== 'investigate') {
      const validation = await runSafeValidation(workspace); worker.validation = validation; await store.text('tests.log', validation.log);
    }
    if (!withReview) return this.finish(store, worker, context.filesInspected, { started, qwenRequests, glmRequests, reworks, providerInputTokens, providerOutputTokens });
    while (true) {
      let review: ReviewResult;
      try { review = await this.deps.reviewer.run(task, toReviewPayload(worker), await gitPatch(workspace)); glmRequests += review.providerRequests; providerInputTokens += review.inputTokens ?? 0; providerOutputTokens += review.outputTokens ?? 0; }
      catch (error) { return this.finish(store, failure('Reviewer API failed.', error), context.filesInspected, { started, qwenRequests, glmRequests, reworks, providerInputTokens, providerOutputTokens }); }
      await store.json(`glm-review${reworks ? `-${reworks}` : ''}.json`, review);
      if ((review.verdict === 'PASS' || review.verdict === 'PASS_WITH_NOTES') && worker.validation.status !== 'failed') return this.finish(store, { ...worker, risks: [...worker.risks, ...review.remainingRisks], review: { verdict: review.verdict, summary: review.summary, remainingRisks: review.remainingRisks } }, context.filesInspected, { started, qwenRequests, glmRequests, reworks, providerInputTokens, providerOutputTokens });
      if (review.needsSol || review.verdict === 'ESCALATE') return this.finish(store, { ...worker, status: 'escalate', needsSol: true, reason: review.reason, question: review.question, options: review.options, review: { verdict: review.verdict, summary: review.summary, remainingRisks: review.remainingRisks } }, context.filesInspected, { started, qwenRequests, glmRequests, reworks, providerInputTokens, providerOutputTokens });
      if (reworks >= this.deps.config.maxReworks) return this.finish(store, { ...worker, status: 'escalate', needsSol: true, reason: 'Reviewer requested rework more than the configured limit.', review: { verdict: review.verdict, summary: review.summary, remainingRisks: review.remainingRisks } }, context.filesInspected, { started, qwenRequests, glmRequests, reworks, providerInputTokens, providerOutputTokens });
      reworks += 1;
      const feedback = worker.validation.status === 'failed' ? [...review.issues, { severity: 'high', message: `Local validation failed: ${worker.validation.summary}`, log_excerpt: worker.validation.log.slice(-4_000) }] : review.issues;
      try { worker = await this.deps.worker.run(task, 'fix', context.text, feedback); qwenRequests += worker.providerRequests; providerInputTokens += worker.inputTokens ?? 0; providerOutputTokens += worker.outputTokens ?? 0; }
      catch (error) { return this.finish(store, failure('Worker rework API failed.', error), context.filesInspected, { started, qwenRequests, glmRequests, reworks, providerInputTokens, providerOutputTokens }); }
      await store.json(`qwen-rework-${reworks}.json`, worker);
      if (worker.needsSol || worker.status !== 'success') return this.finish(store, worker, context.filesInspected, { started, qwenRequests, glmRequests, reworks, providerInputTokens, providerOutputTokens });
      if (worker.patch) { try { await applyUnifiedPatch(workspace, worker.patch); } catch (error) { return this.finish(store, failure('Worker rework patch was not applied.', error), context.filesInspected, { started, qwenRequests, glmRequests, reworks, providerInputTokens, providerOutputTokens }); } }
      const validation = await runSafeValidation(workspace); worker.validation = validation; await store.text(`tests-rework-${reworks}.log`, validation.log);
    }
  }
  private async store(task: string, workspace: string, mode: string, filesInspected: number): Promise<ArtifactStore> {
    const store = new ArtifactStore(this.deps.config.artifactRoot);
    await store.initialize({ taskId: store.taskId, createdAt: new Date().toISOString(), workspace, task, mode, qwenRequests: 0, glmRequests: 0, reworks: 0, filesInspected });
    return store;
  }
  private async finish(store: ArtifactStore, result: CompactResult, filesInspected: number, stats: WorkflowStats = { started: Date.now(), qwenRequests: 0, glmRequests: 0, reworks: 0 }): Promise<Record<string, unknown>> {
    const summary = this.firewall.summarize({ status: result.status, summary: result.summary, rootCause: result.rootCause, changedFiles: result.changedFiles, validation: result.validation, risks: result.risks, confidence: result.confidence, needsSol: result.needsSol, reason: result.reason, question: result.question, options: result.options, review: result.review }, store.ref(['metadata.final.json', 'result.json', 'summary.md']), (result.changedFiles?.length ?? 0) > 10);
    const metadata = { taskId: store.taskId, completedAt: new Date().toISOString(), filesInspected, qwenRequests: stats.qwenRequests, glmRequests: stats.glmRequests, reworks: stats.reworks, durationMs: Date.now() - stats.started, solContextBytes: JSON.stringify(summary).length, providerInputTokens: stats.providerInputTokens, providerOutputTokens: stats.providerOutputTokens };
    await store.json('result.json', summary); await store.text('summary.md', `${String(summary.summary ?? '')}\n`); await store.json('metadata.final.json', metadata);
    return summary;
  }
}
type WorkflowStats = { started: number; qwenRequests: number; glmRequests: number; reworks: number; providerInputTokens?: number; providerOutputTokens?: number };
type CompactResult = Omit<WorkerResult, 'changedFiles' | 'providerRequests'> & { changedFiles?: string[]; review?: { verdict?: string; summary?: string; remainingRisks?: string[] } };
const safeError = (error: unknown) => error instanceof Error ? error.message.slice(0, 300) : 'Unknown error';
const failure = (summary: string, error: unknown): WorkerResult => ({ status: 'failed', summary, changedFiles: [], validation: { status: 'not_run', summary: 'Not run', log: '' }, risks: [], confidence: 'low', needsSol: true, reason: safeError(error), providerRequests: 0 });
const toReviewPayload = (worker: WorkerResult) => ({ ...worker, validation: { status: worker.validation.status, summary: worker.validation.summary } });
