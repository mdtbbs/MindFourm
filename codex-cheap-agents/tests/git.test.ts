import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitPatch } from '../src/workspace/git.js';

test('git patch includes both staged and unstaged changes', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'cheap-git-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: workspace });
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: workspace });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspace });
    await writeFile(join(workspace, 'staged.txt'), 'one\n'); await writeFile(join(workspace, 'unstaged.txt'), 'one\n');
    execFileSync('git', ['add', '.'], { cwd: workspace }); execFileSync('git', ['commit', '-qm', 'initial'], { cwd: workspace });
    await writeFile(join(workspace, 'staged.txt'), 'two\n'); execFileSync('git', ['add', 'staged.txt'], { cwd: workspace });
    await writeFile(join(workspace, 'unstaged.txt'), 'three\n');
    const patch = await gitPatch(workspace);
    assert.match(patch, /staged\.txt/); assert.match(patch, /unstaged\.txt/);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
