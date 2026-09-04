import { spawn } from 'node:child_process';

export const runCapture = (workspace: string, command: string, args: string[], maxBytes = 16_000): Promise<string> => new Promise((resolveOutput) => {
  const child = spawn(command, args, { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  let output = '';
  const append = (chunk: Buffer) => { if (output.length < maxBytes) output += chunk.toString(); };
  child.stdout.on('data', append); child.stderr.on('data', append);
  child.on('error', () => resolveOutput(''));
  child.on('close', () => resolveOutput(output.slice(0, maxBytes)));
});

export const searchRepository = (workspace: string, task: string): Promise<string> => {
  const terms = task.match(/[\p{L}\p{N}_-]{3,}/gu)?.slice(0, 8) ?? [];
  return terms.length ? runCapture(workspace, 'rg', ['-n', '-i', '--glob', '!node_modules', '--glob', '!dist', '-m', '3', terms.join('|'), '.'], 12_000) : Promise.resolve('');
};
