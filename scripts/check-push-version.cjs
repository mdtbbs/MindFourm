#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const input = fs.readFileSync(0, 'utf8').trim();
const pushes = input ? input.split(/\r?\n/).map((line) => line.trim().split(/\s+/)) : [];
const checker = path.join(__dirname, 'check-version-increment.cjs');

for (const [localSha, localRef, remoteSha, remoteRef] of pushes) {
  if (remoteRef !== 'refs/heads/master' || /^0+$/.test(localSha || '') || /^0+$/.test(remoteSha || '')) continue;

  const currentPackage = execFileSync('git', ['show', `${localSha}:package.json`], { cwd: root, encoding: 'utf8' });
  const workingPackage = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  if (currentPackage !== workingPackage) {
    throw new Error(`The package.json in ${localRef} does not match the current worktree. Commit the version change before pushing.`);
  }

  execFileSync(process.execPath, [checker, remoteSha], { cwd: root, stdio: 'inherit' });
}
