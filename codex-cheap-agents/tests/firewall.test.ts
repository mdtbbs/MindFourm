import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextFirewall } from '../src/context/firewall.js';

test('firewall removes patch and caps compact response', () => {
  const output = new ContextFirewall(40).summarize({ status: 'success', summary: 'x'.repeat(10_000), changedFiles: Array(30).fill('src/very-long-file.ts'), validation: { status: 'passed', summary: 'ok' }, risks: Array(30).fill('risk'), confidence: 'high', needsSol: false }, { taskId: 't', directory: '/tmp/t', files: ['patch.diff'] });
  assert.ok(JSON.stringify(output).length <= 40 * 4 + 700);
  assert.equal('patch' in output, false);
  assert.equal((output.artifacts as { files: string[] }).files[0], 'patch.diff');
});
