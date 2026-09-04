import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

export interface ValidationResult { status: 'passed' | 'failed' | 'not_run'; summary: string; log: string; }
export const runSafeValidation = async (workspace: string): Promise<ValidationResult> => {
  let scripts: Record<string, string>;
  try { scripts = (JSON.parse(await readFile(`${workspace}/package.json`, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}; }
  catch { return runNonNodeValidation(workspace); }
  const selected = ['test', 'check', 'lint', 'build'].filter((name) => scripts[name]).slice(0, 3);
  if (!selected.length) return { status: 'not_run', summary: 'No recognized safe package scripts.', log: '' };
  const logs: string[] = [];
  for (const script of selected) {
    const { log, code } = await runCommand(workspace, 'npm', ['run', script]);
    logs.push(`$ npm run ${script}\n${log}`);
    if (code !== 0) {
      return { status: 'failed', summary: `${script} reported a failure`, log: logs.join('\n') };
    }
  }
  return { status: 'passed', summary: `${selected.join(', ')} completed`, log: logs.join('\n') };
};

const runNonNodeValidation = async (workspace: string): Promise<ValidationResult> => {
  const candidates: Array<{ file: string; command: string; args: string[]; label: string }> = [
    { file: 'go.mod', command: 'go', args: ['test', './...'], label: 'go test ./...' },
    { file: 'pom.xml', command: 'mvn', args: ['test', '-q'], label: 'mvn test' },
    { file: 'gradlew', command: './gradlew', args: ['test', '--no-daemon'], label: './gradlew test' },
    { file: 'pyproject.toml', command: 'python', args: ['-m', 'pytest'], label: 'python -m pytest' },
    { file: 'pytest.ini', command: 'python', args: ['-m', 'pytest'], label: 'python -m pytest' },
  ];
  let selected: typeof candidates[number] | undefined;
  for (const entry of candidates) { if (await exists(`${workspace}/${entry.file}`)) { selected = entry; break; } }
  if (!selected) return { status: 'not_run', summary: 'No supported project manifest for automatic validation.', log: '' };
  const { log, code } = await runCommand(workspace, selected.command, selected.args);
  return { status: code === 0 ? 'passed' : 'failed', summary: `${selected.label} ${code === 0 ? 'completed' : 'reported a failure'}`, log: `$ ${selected.label}\n${log}` };
};

const exists = async (path: string): Promise<boolean> => access(path).then(() => true).catch(() => false);
const runCommand = (workspace: string, command: string, args: string[]): Promise<{ log: string; code: number }> => new Promise((resolveRun) => {
  const child = spawn(command, args, { cwd: workspace, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; const append = (chunk: Buffer) => { if (log.length < 20_000) log += chunk.toString(); };
  child.stdout.on('data', append); child.stderr.on('data', append);
  child.on('error', () => resolveRun({ log, code: 1 }));
  child.on('close', (code) => resolveRun({ log: log.slice(0, 20_000), code: code ?? 1 }));
});
