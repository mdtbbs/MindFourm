/**
 * Standalone PM2 config for running MindFourm on its own.
 *
 * The monorepo deploys via the root `ecosystem.config.js` — that is what `deploy.sh`
 * reloads — so this file is only for running the forum in isolation. The two used to
 * disagree: this one declared `instances: 2, exec_mode: 'cluster'` while the root ran
 * a single fork.
 *
 * ── Why this is NOT clustered ────────────────────────────────────────────────
 * Several pieces of state are per-process, so a second worker would break them
 * silently rather than loudly:
 *
 *   • User notification SSE keeps its subscriptions in an in-process Map
 *     (notifications.controller.ts). A notification produced on worker A never
 *     reaches a client connected to worker B. The admin-side stream already uses
 *     Redis pub/sub and would be fine — the user-side one has to be migrated the
 *     same way first.
 *   • SettingsService and BansService cache in process memory with a TTL, so an
 *     admin's change stays invisible to the sibling worker until it expires.
 *   • main.ts runs schema/seed bootstrapping before listen; two workers would race
 *     each other through it.
 *
 * Raise `instances` only after those three are addressed.
 */
module.exports = {
  apps: [
    {
      name: 'mindforum-api',
      script: 'dist/main.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      // Loads the real deployment values (ports, database, OAuth secrets); the
      // explicit env below only guarantees NODE_ENV, which gates cookie Secure
      // flags, the test-auth endpoint and TypeORM's schema handling.
      env_file: './.env',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'mindforum-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: './frontend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env_file: './frontend/.env.local',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
