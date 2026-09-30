#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bumpType = process.argv[2];
const allowedTypes = new Set(['major', 'minor', 'patch']);

if (!allowedTypes.has(bumpType)) {
  console.error('Usage: npm run version:<major|minor|patch>');
  process.exit(1);
}

const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(manifest.version);

if (!match) {
  console.error(`Invalid forum version in package.json: ${manifest.version}`);
  process.exit(1);
}

const current = match.slice(1).map(Number);
const lockVersions = [lock.version, lock.packages?.['']?.version];
if (lockVersions.some((version) => version !== manifest.version)) {
  console.error('package.json and package-lock.json versions do not match.');
  process.exit(1);
}

if (bumpType === 'major') {
  current[0] += 1;
  current[1] = 0;
  current[2] = 0;
} else if (bumpType === 'minor') {
  current[1] += 1;
  current[2] = 0;
} else {
  current[2] += 1;
}

const nextVersion = current.join('.');
manifest.version = nextVersion;
lock.version = nextVersion;
lock.packages[''].version = nextVersion;

fs.writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`Forum version: ${match.slice(1).join('.')} -> ${nextVersion}`);
