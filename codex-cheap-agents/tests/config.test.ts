import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config/env.js';

test('configuration uses defaults and validates positive controls', () => {
  const config = loadConfig({ CHEAP_AGENTS_TIMEOUT_MS: '-3', CHEAP_AGENTS_MAX_REWORKS: '4', CHEAP_AGENTS_WORKSPACE: '/tmp/work' });
  assert.equal(config.timeoutMs, 120_000);
  assert.equal(config.maxReworks, 4);
  assert.equal(config.workspace, '/tmp/work');
});
