/**
 * Playwright Global Teardown — E2E Test Data Cleanup
 *
 * Runs once after all Playwright workers have finished, regardless of pass/fail.
 * Connects directly to MySQL and deletes every row that was seeded by the suite
 * so a subsequent run starts against a clean database and the development DB
 * does not accumulate months of "E2E External Resource-…" / "E2E Fixture Post …"
 * rows.
 *
 * Rows are identified by the same prefixes the seed helpers generate
 * (`E2E …`, `MFL …`, `Playwright`). Deletes run in FK-safe order:
 * notifications and reports first (NO ACTION references to posts), then
 * resources (which CASCADEs into resource_versions, resource_comments, etc.),
 * then replies/attachments on test posts (NO ACTION), then the posts.
 *
 * Database credentials mirror `src/config/app.config.ts`: read from `.env` at
 * the project root with the same fallback defaults the backend uses
 * (localhost / root / no password / mindfourm).
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Resolve `.env` manually because Playwright's ts-node runner does not go
 * through `src/main.ts` and `dotenv/config` only auto-loads from `process.cwd()`,
 * which is the project root when `npx playwright test` runs but can drift when
 * a developer runs a single spec from inside `tests/e2e/`.
 */
function loadDotenv(): void {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1);
    // Strip matching surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function cleanup() {
  loadDotenv();

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mindfourm',
    multipleStatements: true,
  });

  try {
    // 1. Notifications that reference E2E content. NO ACTION FK to posts, so
    //    these must go before posts. Match the same patterns the seed helpers
    //    emit so future prefixes only need updating here.
    const [notifResult] = await connection.execute(
      `DELETE FROM notifications
         WHERE content LIKE '%E2E%'
            OR content LIKE '%Playwright%'
            OR content LIKE '%MFL%'`,
    );
    log('notifications', (notifResult as any).affectedRows);

    // 2. Reports targeting E2E posts/resources, plus any whose reason/detail
    //    mentions E2E (some tests file a report with "E2E report detail").
    const [reportResult] = await connection.execute(
      `DELETE FROM reports
         WHERE (target_type = 'post' AND target_id IN (
                  SELECT id FROM posts WHERE title LIKE 'E2E %'))
            OR (target_type = 'resource' AND target_id IN (
                  SELECT id FROM resources
                   WHERE title LIKE 'E2E %' OR title LIKE 'MFL %'))
            OR reason LIKE '%E2E%'
            OR detail LIKE '%E2E%'`,
    );
    log('reports', (reportResult as any).affectedRows);

    // 3. Resource bookmarks — CASCADE on resource delete covers this, but
    //    deleting explicitly keeps the log output honest.
    const [bmResult] = await connection.execute(
      `DELETE FROM resource_bookmarks
         WHERE resource_id IN (
           SELECT id FROM resources
            WHERE title LIKE 'E2E %' OR title LIKE 'MFL %')`,
    );
    log('resource_bookmarks', (bmResult as any).affectedRows);

    // 4. Resources — FK cascades clean up resource_versions, resource_comments,
    //    resource_downloads, resource_ratings, resource_favorites, etc.
    const [resResult] = await connection.execute(
      `DELETE FROM resources
         WHERE title LIKE 'E2E %'
            OR title LIKE 'MFL %'
            OR title LIKE '%Playwright%'`,
    );
    log('resources', (resResult as any).affectedRows);

    // 5. Resource categories seeded by the category-management tests.
    const [catResult] = await connection.execute(
      `DELETE FROM resource_categories WHERE name LIKE 'E2E%'`,
    );
    log('resource_categories', (catResult as any).affectedRows);

    // 6. Replies on E2E posts — NO ACTION FK, must precede post delete.
    const [replyResult] = await connection.execute(
      `DELETE FROM replies
         WHERE post_id IN (
           SELECT id FROM posts WHERE title LIKE 'E2E %')`,
    );
    log('replies', (replyResult as any).affectedRows);

    // 7. Attachments on E2E posts — NO ACTION FK.
    const [attResult] = await connection.execute(
      `DELETE FROM attachments
         WHERE post_id IN (
           SELECT id FROM posts WHERE title LIKE 'E2E %')`,
    );
    log('attachments', (attResult as any).affectedRows);

    // 8. Post likes on E2E posts — NO ACTION FK.
    const [likeResult] = await connection.execute(
      `DELETE FROM post_likes
         WHERE post_id IN (
           SELECT id FROM posts WHERE title LIKE 'E2E %')`,
    );
    log('post_likes', (likeResult as any).affectedRows);

    // 9. The posts themselves.
    const [postResult] = await connection.execute(
      `DELETE FROM posts WHERE title LIKE 'E2E %'`,
    );
    log('posts', (postResult as any).affectedRows);
  } finally {
    await connection.end();
  }
}

function log(table: string, rows: number): void {
  if (rows > 0) {
    process.stdout.write(`[e2e-teardown] ${table}: removed ${rows} row(s)\n`);
  }
}

export default cleanup;
