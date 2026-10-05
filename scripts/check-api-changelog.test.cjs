'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const SCRIPT = path.join(__dirname, 'check-api-changelog.cjs');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function withRepo(run) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mindfourm-api-changelog-'));
  try {
    git(cwd, 'init', '-q');
    git(cwd, 'config', 'user.name', 'Changelog test');
    git(cwd, 'config', 'user.email', 'changelog-test@example.invalid');
    fs.writeFileSync(path.join(cwd, 'openapi-v1.json'), '{"paths":{}}\n');
    fs.writeFileSync(path.join(cwd, 'README.md'), 'base\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-qm', 'base');
    const baseSha = git(cwd, 'rev-parse', 'HEAD');
    run({ cwd, baseSha });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function runCheck(cwd, baseSha, eventName = 'pull_request', extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: eventName,
      GITHUB_REF_NAME: eventName === 'push' ? 'master' : 'feature',
      ...(baseSha ? { BASE_SHA: baseSha } : {}),
      ...extraEnv,
    },
  });
}

function commitAll(cwd, message) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-qm', message);
}

test('fails when Public V1 contract changes without a changelog update', () => {
  withRepo(({ cwd, baseSha }) => {
    fs.writeFileSync(path.join(cwd, 'openapi-v1.json'), '{"paths":{"/v1/new":{}}}\n');
    commitAll(cwd, 'change public contract');
    const result = runCheck(cwd, baseSha);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Public V1 OpenAPI contract changed, but docs\/api\/changelog-v1\.md was not updated/);
    assert.match(result.stderr, /Added \/ Changed \/ Deprecated \/ Removed \/ Fixed \/ Security/);
  });
});

test('passes when Public V1 contract and changelog both change', () => {
  withRepo(({ cwd, baseSha }) => {
    fs.writeFileSync(path.join(cwd, 'openapi-public-v1.json'), '{"paths":{"/v1/new":{}}}\n');
    fs.mkdirSync(path.join(cwd, 'docs/api'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'docs/api/changelog-v1.md'), '## Unreleased\n');
    commitAll(cwd, 'document public contract change');
    const result = runCheck(cwd, baseSha);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('passes when neither the public contract nor the changelog changes', () => {
  withRepo(({ cwd, baseSha }) => {
    fs.writeFileSync(path.join(cwd, 'README.md'), 'documentation only\n');
    commitAll(cwd, 'update README');
    const result = runCheck(cwd, baseSha);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('passes when only the changelog changes', () => {
  withRepo(({ cwd, baseSha }) => {
    fs.mkdirSync(path.join(cwd, 'docs/api'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'docs/api/changelog-v1.md'), '## Unreleased\n');
    commitAll(cwd, 'update changelog');
    const result = runCheck(cwd, baseSha);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('checks master pushes against their first parent when BASE_SHA is missing', () => {
  withRepo(({ cwd }) => {
    fs.writeFileSync(path.join(cwd, 'openapi-v1.json'), '{"paths":{"/v1/new":{}}}\n');
    fs.mkdirSync(path.join(cwd, 'docs/api'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'docs/api/changelog-v1.md'), '## Unreleased\n');
    commitAll(cwd, 'update contract and changelog on master');
    const result = runCheck(cwd, null, 'push');
    assert.equal(result.status, 0, result.stderr);
  });
});

test('does not skip a master push when the missing changelog update can be detected from its first parent', () => {
  withRepo(({ cwd }) => {
    fs.writeFileSync(path.join(cwd, 'openapi-v1.json'), '{"paths":{"/v1/new":{}}}\n');
    commitAll(cwd, 'change public contract on master');
    const result = runCheck(cwd, null, 'push');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Public V1 OpenAPI contract changed, but docs\/api\/changelog-v1\.md was not updated/);
  });
});
