#!/usr/bin/env node
/**
 * Replaces raw session tokens already stored in `session_audit.session_token` with
 * their SHA-256 digest, and optionally prunes old rows.
 *
 * The application now hashes before writing, but rows created earlier still hold
 * the plaintext bearer token — and those sessions may still be live (7-day TTL,
 * refreshed on use). Run this once after deploying.
 *
 * Usage:
 *   node scripts/scrub-session-audit-tokens.cjs --dry-run
 *   node scripts/scrub-session-audit-tokens.cjs
 *   node scripts/scrub-session-audit-tokens.cjs --prune-days=90
 */

const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');

const HEX_64 = /^[0-9a-f]{64}$/;

function parseArgs(argv) {
  const options = { dryRun: false, batchSize: 1000, pruneDays: null };

  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--batch=')) {
      options.batchSize = Number(arg.slice('--batch='.length));
      if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
        throw new Error(`Invalid --batch value: ${arg}`);
      }
    } else if (arg.startsWith('--prune-days=')) {
      options.pruneDays = Number(arg.slice('--prune-days='.length));
      if (!Number.isInteger(options.pruneDays) || options.pruneDays < 1) {
        throw new Error(`Invalid --prune-days value: ${arg}`);
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function describeError(error) {
  if (error instanceof AggregateError && Array.isArray(error.errors)) {
    return error.errors.map((sub) => sub.message || sub.code).join('; ') || 'connection failed';
  }
  return error.message || String(error);
}

async function main() {
  const options = parseArgs(process.argv);

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mindforum',
  });

  console.log(
    `Scrubbing session_audit tokens in ${connection.config.database}` +
      `${options.dryRun ? ' (dry run — nothing will be written)' : ''}`,
  );

  let scanned = 0;
  let hashed = 0;
  let lastId = 0;

  try {
    for (;;) {
      const [rows] = await connection.query(
        `SELECT id, session_token
           FROM session_audit
          WHERE id > ?
          ORDER BY id
          LIMIT ?`,
        [lastId, options.batchSize],
      );

      if (rows.length === 0) break;

      for (const row of rows) {
        lastId = row.id;
        scanned += 1;

        const token = row.session_token;
        // Already a digest (or empty) — nothing to do.
        if (!token || HEX_64.test(token)) continue;

        hashed += 1;
        if (options.dryRun) continue;

        const digest = crypto.createHash('sha256').update(token).digest('hex');
        await connection.execute('UPDATE session_audit SET session_token = ? WHERE id = ?', [
          digest,
          row.id,
        ]);
      }

      process.stdout.write(`  scanned ${scanned}\r`);
    }

    process.stdout.write(' '.repeat(40) + '\r');
    console.log(`  ${scanned} rows scanned, ${hashed} plaintext tokens hashed`);

    if (options.pruneDays) {
      if (options.dryRun) {
        const [[{ count }]] = await connection.query(
          'SELECT COUNT(*) AS count FROM session_audit WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
          [options.pruneDays],
        );
        console.log(`  ${count} rows older than ${options.pruneDays} days would be deleted`);
      } else {
        const [result] = await connection.execute(
          'DELETE FROM session_audit WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
          [options.pruneDays],
        );
        console.log(`  ${result.affectedRows} rows older than ${options.pruneDays} days deleted`);
      }
    }
  } finally {
    await connection.end();
  }

  if (options.dryRun && hashed > 0) {
    console.log('\nRe-run without --dry-run to apply.');
  } else {
    console.log('\nDone.');
  }
}

main().catch((error) => {
  console.error(`\nFailed: ${describeError(error)}`);
  if (error.code === 'EACCES' || error.code === 'ECONNREFUSED') {
    console.error('Check that MySQL is running and that the MYSQL_* values in .env are correct.');
  }
  process.exit(1);
});
