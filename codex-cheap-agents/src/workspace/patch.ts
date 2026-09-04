import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const forbidden = /(?:^|\n)(?:\+\+\+|---)\s+(?:\/|\.\.\/)|\0/;
export const applyUnifiedPatch = async (workspace: string, patch: string): Promise<void> => {
  if (!patch.trim()) return;
  if (patch.length > 1_000_000 || forbidden.test(patch) || !/^diff --git a\/.+ b\/.+/m.test(patch)) {
    throw new Error('Rejected unsafe or invalid patch');
  }
  const directory = await mkdtemp(join(tmpdir(), 'cheap-agents-'));
  const patchFile = join(directory, 'change.patch');
  try {
    await writeFile(patchFile, patch, 'utf8');
    for (const args of [['apply', '--check', '--whitespace=nowarn', patchFile], ['apply', '--whitespace=nowarn', patchFile]]) {
      await new Promise<void>((resolveApply, reject) => {
        const child = spawn('git', args, { cwd: workspace, stdio: 'ignore' });
        child.on('error', reject); child.on('close', (code) => code === 0 ? resolveApply() : reject(new Error('Patch did not apply cleanly')));
      });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
};
