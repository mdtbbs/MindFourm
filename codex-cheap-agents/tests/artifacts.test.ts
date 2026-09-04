import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArtifactStore } from '../src/artifacts/store.js';

test('artifact store writes private task files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cheap-artifacts-'));
  try { const store = new ArtifactStore(root, 'task-test'); await store.initialize({ taskId: 'task-test', createdAt: 'now', workspace: '/tmp', task: 'x', mode: 'auto', qwenRequests: 0, glmRequests: 0, reworks: 0, filesInspected: 0 }); await store.text('summary.md', 'short'); assert.equal(await readFile(join(root, 'task-test', 'summary.md'), 'utf8'), 'short'); }
  finally { await rm(root, { recursive: true, force: true }); }
});
