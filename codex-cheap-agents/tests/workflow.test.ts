import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workflow } from '../src/agents/workflow.js';
import { QwenWorker } from '../src/agents/qwen-worker.js';
import { GlmReviewer } from '../src/agents/glm-reviewer.js';
import { MockProvider } from '../src/providers/mock.js';
import type { AppConfig } from '../src/config/schema.js';

const workerReply = (summary = 'fixed') => JSON.stringify({ status: 'success', summary, changed_files: [], validation: { status: 'not_run', summary: 'pending' }, risks: [], confidence: 'high', needs_sol: false });
const reviewReply = (verdict: string) => JSON.stringify({ verdict, summary: verdict, issues: verdict === 'REWORK' ? [{ severity: 'medium', message: 'fix edge case' }] : [], validation_assessment: 'passed', remaining_risks: [], confidence: 'high', needs_rework: verdict === 'REWORK', needs_sol: verdict === 'ESCALATE' });
async function fixture(qwen: string[], glm: string[], scripts: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cheap-workflow-')); await writeFile(join(root, 'package.json'), JSON.stringify({ scripts }));
  const config: AppConfig = { workspace: root, artifactRoot: join(root, 'artifacts'), timeoutMs: 100, maxReworks: 2, qwen: {}, glm: {} };
  return { root, workflow: new Workflow({ config, worker: new QwenWorker(new MockProvider('qwen', qwen), 100), reviewer: new GlmReviewer(new MockProvider('glm', glm), 100) }) };
}
test('workflow automatically reworks until reviewer passes', async () => {
  const { root, workflow } = await fixture([workerReply('initial'), workerReply('reworked')], [reviewReply('REWORK'), reviewReply('PASS')]);
  try { const result = await workflow.execute('fix a TypeScript bug', root, 'fix', true); assert.equal(result.status, 'success'); assert.equal((result.review as { verdict: string }).verdict, 'PASS'); }
  finally { await rm(root, { recursive: true, force: true }); }
});
test('workflow forwards a narrow reviewer escalation', async () => {
  const { root, workflow } = await fixture([workerReply()], [JSON.stringify({ verdict: 'ESCALATE', summary: 'permission policy unclear', issues: [], validation_assessment: 'insufficient', remaining_risks: [], confidence: 'high', needs_rework: false, needs_sol: true, reason: 'permission semantics', question: 'Should admins bypass?', options: ['yes', 'no'] })]);
  try { const result = await workflow.execute('change permissions', root, 'fix', true); assert.equal(result.needs_sol, true); assert.equal(result.question, 'Should admins bypass?'); }
  finally { await rm(root, { recursive: true, force: true }); }
});
test('workflow cannot report success when local validation fails', async () => {
  const { root, workflow } = await fixture([workerReply('initial'), workerReply('fix one'), workerReply('fix two')], [reviewReply('PASS'), reviewReply('PASS'), reviewReply('PASS')], { test: 'node -e "process.exit(1)"' });
  try { const result = await workflow.execute('fix a bug', root, 'fix', true); assert.equal(result.needs_sol, true); assert.match(String(result.reason), /rework/); }
  finally { await rm(root, { recursive: true, force: true }); }
});
test('workflow refuses a broad filesystem workspace target', async () => {
  const { root, workflow } = await fixture([workerReply()], [reviewReply('PASS')]);
  try { await assert.rejects(() => workflow.execute('inspect', '/', 'auto', true), /filesystem root/); }
  finally { await rm(root, { recursive: true, force: true }); }
});
