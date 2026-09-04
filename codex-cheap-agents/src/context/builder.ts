import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gitStatus } from '../workspace/git.js';
import { readText } from '../workspace/reader.js';
import { searchRepository } from '../workspace/search.js';

export interface BuiltContext { text: string; filesInspected: number; }
export class ContextBuilder {
  async build(workspace: string, task: string): Promise<BuiltContext> {
    const [entries, agents, packageJson, status, search] = await Promise.all([
      readdir(workspace, { withFileTypes: true }).catch(() => []), readText(workspace, 'AGENTS.md'), readText(workspace, 'package.json'),
      gitStatus(workspace), searchRepository(workspace, task),
    ]);
    const tree = entries.filter((entry) => !['node_modules', '.git', 'dist', '.next'].includes(entry.name))
      .slice(0, 80).map((entry) => `${entry.isDirectory() ? 'd' : 'f'} ${entry.name}`).join('\n');
    const candidates = [...new Set((search.match(/^([^:\n]+):\d+:/gm) ?? []).map((line) => line.slice(0, line.indexOf(':'))))].slice(0, 8);
    const snippets = await Promise.all(candidates.map(async (file) => `FILE: ${file}\n${await readText(workspace, file, 3_000) ?? ''}`));
    const sections = [
      `WORKSPACE: ${workspace}`, `TOP LEVEL:\n${tree}`, agents && `AGENTS.md:\n${agents}`, packageJson && `package.json:\n${packageJson}`,
      status && `GIT STATUS:\n${status}`, search && `SEARCH RESULTS (truncated):\n${search}`, ...snippets,
    ].filter(Boolean);
    return { text: sections.join('\n\n').slice(0, 48_000), filesInspected: candidates.length + 2 };
  }
}
