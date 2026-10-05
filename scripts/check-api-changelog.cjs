#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');

const PUBLIC_CONTRACT_PATHS = new Set([
  'openapi-v1.json',
  'openapi-public-v1.json',
]);
const CHANGELOG_PATH = 'docs/api/changelog-v1.md';

function git(args, cwd = process.cwd()) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function resolveBaseSha(env = process.env, cwd = process.cwd()) {
  const eventName = env.GITHUB_EVENT_NAME || '';
  let baseSha = env.BASE_SHA || env.GITHUB_BASE_SHA || '';

  // Push workflows compare against GitHub's before SHA. If it is unavailable,
  // use the first parent on master so a normal master push is still checked.
  if ((!baseSha || /^0+$/.test(baseSha)) && eventName === 'push' && env.GITHUB_REF_NAME === 'master') {
    try {
      baseSha = git(['rev-parse', '--verify', 'HEAD^'], cwd);
    } catch {
      return null;
    }
  }

  if (!baseSha || /^0+$/.test(baseSha)) {
    if (eventName === 'pull_request') {
      throw new Error('Could not determine the pull request base SHA; set BASE_SHA from github.event.pull_request.base.sha.');
    }
    return null;
  }

  return baseSha;
}

function checkApiChangelog({ env = process.env, cwd = process.cwd() } = {}) {
  const baseSha = resolveBaseSha(env, cwd);
  if (!baseSha) {
    return { skipped: true, message: `Skipping Public V1 changelog check: no base SHA is available for ${env.GITHUB_EVENT_NAME || 'this invocation'}.` };
  }

  const headSha = env.HEAD_SHA || 'HEAD';
  let mergeBase;
  try {
    mergeBase = git(['merge-base', baseSha, headSha], cwd);
  } catch {
    throw new Error(`Could not find a Git merge-base for ${baseSha} and ${headSha}. Ensure the checkout includes full history.`);
  }

  const changedFiles = new Set(git(['diff', '--name-only', '-z', mergeBase, headSha], cwd).split('\0').filter(Boolean));
  const contractChanged = [...PUBLIC_CONTRACT_PATHS].some((file) => changedFiles.has(file));
  const changelogChanged = changedFiles.has(CHANGELOG_PATH);

  if (contractChanged && !changelogChanged) {
    return {
      skipped: false,
      ok: false,
      message: 'Public V1 OpenAPI contract changed, but docs/api/changelog-v1.md was not updated.\nDocument Added / Changed / Deprecated / Removed / Fixed / Security changes before merging.',
    };
  }

  if (contractChanged) return { skipped: false, ok: true, message: 'Public V1 OpenAPI contract and changelog were both updated.' };
  return { skipped: false, ok: true, message: 'No Public V1 OpenAPI contract change requires a changelog update.' };
}

if (require.main === module) {
  try {
    const result = checkApiChangelog();
    if (result.ok === false) {
      console.error(result.message);
      process.exitCode = 1;
    } else if (result.message) {
      console.log(result.message);
    }
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { checkApiChangelog, resolveBaseSha };
