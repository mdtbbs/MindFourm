#!/usr/bin/env node
/**
 * Production start script for standalone Next.js builds.
 *
 * `output: 'standalone'` produces a trimmed deployment tree at
 * `.next/standalone/`, but it intentionally omits two folders that the
 * standalone server still needs at runtime:
 *
 *   .next/standalone/.next/static   ← hashed CSS / JS chunks
 *   .next/standalone/public         ← favicon, robots.txt, etc.
 *
 * The Dockerfile copies these in at image build time. For bare-metal / PM2 /
 * BT Panel (宝塔) deployments we replicate the same copy step here so
 * `npm run start` works without a separate setup script.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const SERVER_JS = path.join(STANDALONE, 'server.js');

if (!fs.existsSync(SERVER_JS)) {
  console.error(
    '[start-standalone] Standalone server not found at:\n' +
    `  ${SERVER_JS}\n` +
    '[start-standalone] Run `npm run build` first.'
  );
  process.exit(1);
}

/**
 * Mirror a directory tree. No-op when `src` is missing so the script is
 * idempotent across re-runs and tolerant of empty `public/` folders.
 */
function mirrorDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      mirrorDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

mirrorDir(
  path.join(ROOT, '.next', 'static'),
  path.join(STANDALONE, '.next', 'static')
);
mirrorDir(
  path.join(ROOT, 'public'),
  path.join(STANDALONE, 'public')
);

// Load .env.local for runtime env vars (API_URL, etc.) — Next.js does not
// auto-load .env files in standalone production mode.
const dotenvPath = path.join(ROOT, '.env.local');
if (fs.existsSync(dotenvPath)) {
  const lines = fs.readFileSync(dotenvPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

// Hand off to the Next.js standalone server. Spawn rather than `require` so
// signals (SIGTERM from PM2 / 宝塔 / docker stop) reach the real process and
// exit codes propagate correctly.
const child = spawn(process.execPath, [SERVER_JS], {
  stdio: 'inherit',
  cwd: STANDALONE,
  env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
});

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on('SIGTERM', () => forward('SIGTERM'));
process.on('SIGINT', () => forward('SIGINT'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
