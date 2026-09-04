import { runCapture } from './search.js';
export const gitStatus = (workspace: string) => runCapture(workspace, 'git', ['status', '--short'], 4_000);
export const gitDiff = async (workspace: string): Promise<string> => combine([
  await runCapture(workspace, 'git', ['diff', '--no-ext-diff', '--stat']),
  await runCapture(workspace, 'git', ['diff', '--cached', '--no-ext-diff', '--stat']),
]);
export const gitPatch = async (workspace: string): Promise<string> => combine([
  await runCapture(workspace, 'git', ['diff', '--no-ext-diff'], 50_000),
  await runCapture(workspace, 'git', ['diff', '--cached', '--no-ext-diff'], 50_000),
]);

const combine = (parts: string[]): string => parts.filter(Boolean).join('\n').slice(0, 50_000);
