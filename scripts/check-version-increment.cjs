#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const baseSha = process.argv[2];
const zeroSha = /^0+$/.test(baseSha || '');

function parseVersion(raw, source) {
  const match = /"version"\s*:\s*"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"/.exec(raw);
  if (!match) throw new Error(`Could not read a stable MAJOR.MINOR.PATCH version from ${source}.`);
  return match.slice(1).map(Number);
}

function showPackage(sha) {
  return execFileSync('git', ['show', `${sha}:package.json`], { cwd: root, encoding: 'utf8' });
}

function isSingleBump(previous, current) {
  return (current[0] === previous[0] + 1 && current[1] === 0 && current[2] === 0)
    || (current[0] === previous[0] && current[1] === previous[1] + 1 && current[2] === 0)
    || (current[0] === previous[0] && current[1] === previous[1] && current[2] === previous[2] + 1);
}

try {
  const packageRaw = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const manifest = JSON.parse(packageRaw);
  if (lock.version !== manifest.version || lock.packages?.['']?.version !== manifest.version) {
    throw new Error('package.json and package-lock.json forum versions must match.');
  }
  const currentVersion = parseVersion(packageRaw, 'package.json');
  if (!baseSha || zeroSha) {
    console.log(`Initial master push; forum version ${currentVersion.join('.')} is valid.`);
    process.exit(0);
  }

  const previousVersion = parseVersion(showPackage(baseSha), `${baseSha}:package.json`);
  if (!isSingleBump(previousVersion, currentVersion)) {
    throw new Error(
      `master push must increment exactly one version segment: ${previousVersion.join('.')} -> ${currentVersion.join('.')}.\n`
      + 'Choose npm run version:major, version:minor, or version:patch before committing.',
    );
  }

  console.log(`Forum version increment: ${previousVersion.join('.')} -> ${currentVersion.join('.')}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
