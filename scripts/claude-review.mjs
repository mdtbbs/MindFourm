#!/usr/bin/env node
/**
 * Run Claude Code as a diff-driven, read-only reviewer.
 * This script never executes text returned by Claude.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const TMP_DIR = resolve(ROOT, '.tmp');
const REPORT_PATH = resolve(TMP_DIR, 'claude-review.json');
const RAW_PATH = resolve(TMP_DIR, 'claude-review.raw.json');
const REQUEST_PATH = resolve(TMP_DIR, 'claude-review-request.md');
const PROMPT_PATH = resolve(ROOT, 'scripts', 'claude-review-prompt.md');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const MAX_FILES_PER_BATCH = 12;
const LARGE_DIFF_FILES = 20;
const LARGE_DIFF_LINES = 1600;
const MAX_UNTRACKED_INLINE_BYTES = 256 * 1024;
const MAX_BUDGET_USD = process.env.CLAUDE_REVIEW_MAX_BUDGET_USD || '1';
const EXCLUDED_PATH_PARTS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.cache', 'coverage']);

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'risk', 'summary', 'issues'],
  properties: {
    status: { enum: ['pass', 'fail'] },
    risk: { enum: ['low', 'medium', 'high', 'critical'] },
    summary: { type: 'string', minLength: 1 },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'file', 'line', 'title', 'description', 'evidence', 'suggestion'],
        properties: {
          severity: { enum: ['low', 'medium', 'high', 'critical'] },
          file: { type: 'string', minLength: 1 },
          line: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
          title: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          evidence: { type: 'string', minLength: 1 },
          suggestion: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
}

function fail(message, exitCode = 1) {
  console.error(`[Claude Review] ${message}`);
  process.exit(exitCode);
}

function git(...args) {
  const result = run('git', args);
  if (result.error || result.status !== 0) {
    fail(result.stderr.trim() || `git ${args.join(' ')} failed.`);
  }
  return result.stdout;
}

function isExcluded(file) {
  return file.split('/').some((part) => EXCLUDED_PATH_PARTS.has(part));
}

function parseStatus(output) {
  const fields = output.split('\0');
  const files = [];
  for (let index = 0; index < fields.length - 1; index += 1) {
    const record = fields[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    const file = record.slice(3);
    // In porcelain v1, renames/copies are followed by the original path.
    if (status.includes('R') || status.includes('C')) index += 1;
    if (file && !isExcluded(file)) files.push({ status, file });
  }
  return files;
}

function isTextFile(file) {
  try {
    const content = readFileSync(resolve(ROOT, file));
    return !content.includes(0);
  } catch {
    return false;
  }
}

function untrackedSection(file) {
  const absolute = resolve(ROOT, file);
  if (!existsSync(absolute)) return `\n### Untracked file removed before review: ${file}\n`;
  if (!isTextFile(file)) return `\n### Untracked binary file: ${file}\nNot inlined. Inspect metadata only if it is relevant to the diff.\n`;
  const content = readFileSync(absolute, 'utf8');
  if (Buffer.byteLength(content) > MAX_UNTRACKED_INLINE_BYTES) {
    return `\n### Untracked file: ${file}\nContent exceeds ${MAX_UNTRACKED_INLINE_BYTES} bytes and is not inlined. Read only relevant sections if needed.\n`;
  }
  return `\n### Untracked file: ${file}\n\`\`\`\n${content}\n\`\`\`\n`;
}

function changedLineCount(files) {
  const trackedLineCount = git('diff', '--no-ext-diff', '--numstat', 'HEAD').trim()
    .split('\n')
    .filter(Boolean)
    .reduce((total, line) => {
      const [added, deleted] = line.split('\t');
      return total + (Number.parseInt(added, 10) || 0) + (Number.parseInt(deleted, 10) || 0);
    }, 0);
  return trackedLineCount + files
    .filter(({ status, file }) => status === '??' && isTextFile(file))
    .reduce((total, { file }) => total + readFileSync(resolve(ROOT, file), 'utf8').split('\n').length, 0);
}

function reviewPacket(files) {
  const untracked = files.filter(({ status }) => status === '??').map(({ file }) => file);
  const tracked = files.filter(({ status }) => status !== '??').map(({ file }) => file);
  const patch = tracked.length === 0 ? '' : git('diff', '--no-ext-diff', '--binary', 'HEAD', '--', ...tracked);
  return [
    '# Review packet',
    `Changed files in this batch (${files.length}):`,
    ...files.map(({ status, file }) => `- [${status}] ${file}`),
    '',
    '## Git diff against HEAD',
    patch || '(No tracked diff in this batch.)',
    ...untracked.map(untrackedSection),
  ].join('\n');
}

function validateReport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!['pass', 'fail'].includes(value.status)) return false;
  if (!['low', 'medium', 'high', 'critical'].includes(value.risk)) return false;
  if (typeof value.summary !== 'string' || value.summary.length === 0 || !Array.isArray(value.issues)) return false;
  return value.issues.every((issue) => issue && typeof issue === 'object'
    && ['low', 'medium', 'high', 'critical'].includes(issue.severity)
    && typeof issue.file === 'string' && issue.file.length > 0
    && (issue.line === null || (Number.isInteger(issue.line) && issue.line > 0))
    && ['title', 'description', 'evidence', 'suggestion'].every((key) => typeof issue[key] === 'string' && issue[key].length > 0));
}

function extractReport(stdout) {
  const parsed = JSON.parse(stdout);
  const candidates = [parsed.structured_output, parsed.result, parsed];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      try {
        const report = JSON.parse(candidate);
        if (validateReport(report)) return report;
      } catch {
        // Try the next response shape.
      }
    } else if (validateReport(candidate)) {
      return candidate;
    }
  }
  throw new Error('Claude returned JSON, but it does not match the review report schema.');
}

function riskRank(risk) {
  return ['low', 'medium', 'high', 'critical'].indexOf(risk);
}

function parseRound() {
  const roundArg = process.argv.find((arg) => arg.startsWith('--round='));
  const round = Number(roundArg?.split('=')[1] || '1');
  if (!Number.isInteger(round) || round < 1 || round > 2) fail('Review round must be 1 or 2. Automatic review stops after round 2.');
  return round;
}

const dryRun = process.argv.includes('--dry-run');

const round = parseRound();
const selectedPaths = process.argv.filter((arg) => arg.startsWith('--path=')).map((arg) => arg.slice('--path='.length));
console.log('[Claude Review] Checking repository...');
if (git('rev-parse', '--is-inside-work-tree').trim() !== 'true') fail('Current directory is not a Git repository.');

const claudeVersion = run(CLAUDE_BIN, ['--version']);
if (claudeVersion.error || claudeVersion.status !== 0) fail('Claude Code is not available.');
if (!existsSync(PROMPT_PATH)) fail(`Missing reviewer prompt: ${PROMPT_PATH}`);

let changedFiles = parseStatus(git('status', '--short', '-z'));
if (selectedPaths.length > 0) {
  const selected = new Set(selectedPaths);
  changedFiles = changedFiles.filter(({ file }) => selected.has(file));
  const missing = selectedPaths.filter((file) => !changedFiles.some((change) => change.file === file));
  if (missing.length > 0) fail(`Requested review path is not a changed, reviewable file: ${missing.join(', ')}`);
}
if (changedFiles.length === 0) {
  mkdirSync(TMP_DIR, { recursive: true });
  const report = { status: 'pass', risk: 'low', summary: 'No uncommitted changes to review.', issues: [] };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log('[Claude Review] No changed files detected.');
  console.log('\nPASS\nRisk: low\nIssues: 0');
  process.exit(0);
}

const fullDiffLineCount = changedLineCount(changedFiles);
const largeDiff = changedFiles.length > LARGE_DIFF_FILES || fullDiffLineCount > LARGE_DIFF_LINES;
console.log(`[Claude Review] ${changedFiles.length} changed files detected`);
if (largeDiff) console.log('[Claude Review] Large diff detected. Reviewing in bounded file batches.');
console.log('[Claude Review] Starting read-only review...');

mkdirSync(TMP_DIR, { recursive: true });
const template = readFileSync(PROMPT_PATH, 'utf8');
const batches = [];
for (let index = 0; index < changedFiles.length; index += MAX_FILES_PER_BATCH) batches.push(changedFiles.slice(index, index + MAX_FILES_PER_BATCH));

const rawResponses = [];
const reports = [];
for (const [index, batch] of batches.entries()) {
  const packet = reviewPacket(batch);
  const request = `${template}\n\nReview round: ${round} of 2.\nBatch: ${index + 1} of ${batches.length}.\n${packet}`;
  writeFileSync(REQUEST_PATH, request);
  if (dryRun) continue;
  const response = run(CLAUDE_BIN, [
    '--safe-mode', '--no-session-persistence', '--print', '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--max-budget-usd', MAX_BUDGET_USD,
    '--tools', 'Read,Glob,Grep',
    '--disallowedTools', 'Edit,Write,Bash,NotebookEdit',
  ], { input: request, maxBuffer: 20 * 1024 * 1024 });
  rawResponses.push({ batch: index + 1, stdout: response.stdout, stderr: response.stderr, status: response.status });
  if (response.error || response.status !== 0) {
    writeFileSync(RAW_PATH, `${JSON.stringify(rawResponses, null, 2)}\n`);
    fail(`Claude review failed for batch ${index + 1}: ${response.stderr.trim() || response.error?.message || 'unknown Claude CLI error'}`);
  }
  try {
    reports.push(extractReport(response.stdout));
  } catch (error) {
    writeFileSync(RAW_PATH, `${JSON.stringify(rawResponses, null, 2)}\n`);
    fail(`${error.message} Raw response saved to ${RAW_PATH}.`);
  }
}

if (dryRun) {
  const report = { status: 'pass', risk: 'low', summary: `Dry run prepared ${changedFiles.length} changed file(s) in ${batches.length} batch(es); Claude was not invoked.`, issues: [] };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nPASS\nRisk: low\nIssues: 0\n\nReport: ${REPORT_PATH}`);
  process.exit(0);
}

writeFileSync(RAW_PATH, `${JSON.stringify(rawResponses, null, 2)}\n`);
const issues = reports.flatMap((report) => report.issues);
const risk = reports.reduce((highest, report) => riskRank(report.risk) > riskRank(highest) ? report.risk : highest, 'low');
const report = {
  status: reports.some((item) => item.status === 'fail') ? 'fail' : 'pass',
  risk,
  summary: reports.length === 1 ? reports[0].summary : `Reviewed ${changedFiles.length} files in ${reports.length} batches. ${issues.length} issue(s) reported.`,
  issues,
};
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log('\n[Claude Review] Review completed');
console.log(`\n${report.status.toUpperCase()}\nRisk: ${report.risk}\nIssues: ${report.issues.length}`);
for (const issue of report.issues) console.log(`\n${issue.severity.toUpperCase()} ${issue.file}:${issue.line ?? '?'}\n${issue.title}`);
console.log(`\nReport: ${REPORT_PATH}`);
process.exit(report.status === 'pass' ? 0 : 2);
