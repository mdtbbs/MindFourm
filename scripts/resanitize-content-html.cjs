#!/usr/bin/env node
/**
 * Re-derives `content_html` from the stored markdown `content` for every row that
 * has one.
 *
 * Rows written before the sanitizer was fixed can contain live `<script>` tags and
 * unquoted event handlers, because the old `sanitize()` only stripped *quoted*
 * `on*=` attributes and the literal string `javascript:`. Fixing the sanitizer
 * only protects new writes, so existing HTML has to be regenerated.
 *
 * Usage:
 *   npm run build                              # dist/ must be current
 *   node scripts/resanitize-content-html.cjs --dry-run
 *   node scripts/resanitize-content-html.cjs
 *
 * Flags:
 *   --dry-run     report what would change without writing
 *   --batch=N     rows fetched per round (default 500)
 *   --table=NAME  restrict to one table (repeatable)
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MARKDOWN_UTIL = path.join(__dirname, '..', 'dist', 'common', 'utils', 'markdown.util.js');

if (!fs.existsSync(MARKDOWN_UTIL)) {
  console.error(`Compiled sanitizer not found at ${MARKDOWN_UTIL}`);
  console.error('Run "npm run build" first so this script reuses the exact production sanitizer.');
  process.exit(1);
}

const { parseMarkdown } = require(MARKDOWN_UTIL);
const mysql = require('mysql2/promise');

/** Tables carrying a markdown/HTML pair, in dependency-free order. */
const TABLES = [
  { table: 'posts', idColumn: 'id' },
  { table: 'replies', idColumn: 'id' },
  { table: 'resources', idColumn: 'id' },
  { table: 'messages', idColumn: 'id' },
];

function parseArgs(argv) {
  const options = { dryRun: false, batchSize: 500, tables: [] };

  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--batch=')) {
      const value = parseInt(arg.slice('--batch='.length), 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error(`Invalid --batch value: ${arg}`);
      }
      options.batchSize = value;
    } else if (arg.startsWith('--table=')) {
      options.tables.push(arg.slice('--table='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function processTable(connection, { table, idColumn }, options) {
  const stats = { scanned: 0, changed: 0, cleared: 0 };
  let lastId = 0;

  for (;;) {
    const [rows] = await connection.query(
      `SELECT \`${idColumn}\` AS id, content, content_html
         FROM \`${table}\`
        WHERE \`${idColumn}\` > ?
        ORDER BY \`${idColumn}\`
        LIMIT ?`,
      [lastId, options.batchSize],
    );

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      lastId = row.id;
      stats.scanned += 1;

      // No markdown source to regenerate from. Blanking the HTML is the only safe
      // option, since it can no longer be verified.
      if (row.content === null || row.content === '') {
        if (row.content_html) {
          stats.cleared += 1;
          if (!options.dryRun) {
            await connection.execute(
              `UPDATE \`${table}\` SET content_html = '' WHERE \`${idColumn}\` = ?`,
              [row.id],
            );
          }
        }
        continue;
      }

      const rebuilt = parseMarkdown(row.content);
      if (rebuilt === row.content_html) {
        continue;
      }

      stats.changed += 1;
      if (options.dryRun) {
        continue;
      }

      await connection.execute(
        `UPDATE \`${table}\` SET content_html = ? WHERE \`${idColumn}\` = ?`,
        [rebuilt, row.id],
      );
    }

    process.stdout.write(`  ${table}: scanned ${stats.scanned}\r`);
  }

  process.stdout.write(' '.repeat(60) + '\r');
  return stats;
}

async function main() {
  const options = parseArgs(process.argv);

  const targets = options.tables.length
    ? TABLES.filter((entry) => options.tables.includes(entry.table))
    : TABLES;

  if (targets.length === 0) {
    throw new Error(
      `No matching tables. Known tables: ${TABLES.map((entry) => entry.table).join(', ')}`,
    );
  }

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mindforum',
  });

  console.log(
    `Re-sanitizing content_html in ${connection.config.database}` +
      `${options.dryRun ? ' (dry run — nothing will be written)' : ''}`,
  );

  const totals = { scanned: 0, changed: 0, cleared: 0 };

  try {
    for (const target of targets) {
      const stats = await processTable(connection, target, options);
      totals.scanned += stats.scanned;
      totals.changed += stats.changed;
      totals.cleared += stats.cleared;

      console.log(
        `  ${target.table}: ${stats.scanned} scanned, ` +
          `${stats.changed} rewritten, ${stats.cleared} blanked`,
      );
    }
  } finally {
    await connection.end();
  }

  console.log(
    `\nDone. ${totals.scanned} rows scanned, ${totals.changed} rewritten, ` +
      `${totals.cleared} blanked.`,
  );

  if (options.dryRun && totals.changed + totals.cleared > 0) {
    console.log('Re-run without --dry-run to apply.');
  }
}

function describeError(error) {
  // A failed MySQL connect rejects with an AggregateError whose own `message` is
  // empty — the useful detail sits in `errors`.
  if (error instanceof AggregateError && Array.isArray(error.errors)) {
    const details = error.errors.map((sub) => sub.message || sub.code).join('; ');
    return details || 'connection failed';
  }
  return error.message || String(error);
}

main().catch((error) => {
  console.error(`\nFailed: ${describeError(error)}`);
  if (error.code === 'EACCES' || error.code === 'ECONNREFUSED') {
    console.error('Check that MySQL is running and that the MYSQL_* values in .env are correct.');
  }
  process.exit(1);
});
