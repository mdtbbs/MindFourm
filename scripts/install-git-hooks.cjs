#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.env.CI || process.env.GITHUB_ACTIONS) process.exit(0);

const root = path.resolve(__dirname, '..');
try {
  const hooksPath = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8' }).trim();
  const hooksDir = path.isAbsolute(hooksPath) ? hooksPath : path.resolve(root, hooksPath);
  const hookPath = path.join(hooksDir, 'pre-push');
  const marker = 'Managed by MindFourm: validate forum version on master pushes';

  fs.mkdirSync(hooksDir, { recursive: true });
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf8');
    if (existing.includes(marker)) process.exit(0);
    console.warn(`Skipped ${hookPath}: an existing pre-push hook was left unchanged.`);
    process.exit(0);
  }

  const hook = `#!/bin/sh\n# ${marker}\nREPO_ROOT="$(git rev-parse --show-toplevel)"\nexec node "$REPO_ROOT/scripts/check-push-version.cjs"\n`;
  fs.writeFileSync(hookPath, hook, { mode: 0o755 });
  fs.chmodSync(hookPath, 0o755);
  console.log('Installed MindFourm pre-push version check.');
} catch (error) {
  console.warn(`Could not install MindFourm pre-push hook: ${error.message}`);
}
