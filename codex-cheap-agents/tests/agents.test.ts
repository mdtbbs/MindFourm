import test from 'node:test';
import assert from 'node:assert/strict';
import { QwenWorker } from '../src/agents/qwen-worker.js';
import { GlmReviewer } from '../src/agents/glm-reviewer.js';
import { MockProvider } from '../src/providers/mock.js';

test('worker accepts fenced structured JSON and preserves escalation', async () => {
  const worker = new QwenWorker(new MockProvider('qwen', ['```json\n{"status":"escalate","summary":"ambiguous","changed_files":[],"validation":{"status":"not_run","summary":"n/a"},"risks":[],"confidence":"high","needs_sol":true,"question":"Choose policy?","options":["A","B"]}\n```']), 100);
  const result = await worker.run('task', 'investigate', 'context');
  assert.equal(result.needsSol, true); assert.deepEqual(result.options, ['A', 'B']);
});
test('reviewer treats an unknown verdict as safe rework', async () => {
  const reviewer = new GlmReviewer(new MockProvider('glm', ['{"verdict":"MAYBE","summary":"unclear"}']), 100);
  const result = await reviewer.run('task', {}, '');
  assert.equal(result.verdict, 'REWORK'); assert.equal(result.needsRework, true);
});
test('worker repairs malformed model output once', async () => {
  const worker = new QwenWorker(new MockProvider('qwen', ['not json', '{"status":"success","summary":"repaired","changed_files":[],"validation":{"status":"not_run","summary":"n/a"},"risks":[],"confidence":"high","needs_sol":false}']), 100);
  const result = await worker.run('task', 'auto', 'context');
  assert.equal(result.providerRequests, 2); assert.equal(result.summary, 'repaired');
});
test('worker rejects output that remains malformed after one repair', async () => {
  const worker = new QwenWorker(new MockProvider('qwen', ['not json', 'still not json']), 100);
  await assert.rejects(() => worker.run('task', 'auto', 'context'), /JSON object/);
});
