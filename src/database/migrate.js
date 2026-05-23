/**
 * SQLite to MySQL Data Migration Script
 *
 * Usage: node src/database/migrate.js
 *
 * This script reads data from SQLite (better-sqlite3) and inserts into MySQL.
 * Sessions are NOT migrated - they will be stored in Redis.
 */

const Database = require('better-sqlite3');
const path = require('path');
const mysql = require('./mysql');
const config = require('../config');

const BATCH_SIZE = 100; // Insert in batches for performance

async function migrateData() {
  // Initialize MySQL connection
  mysql.initialize();

  // Open SQLite database
  const sqlitePath = path.join(__dirname, '../../data/forum.db');
  const sqlite = new Database(sqlitePath);

  console.log(`Migrating from SQLite: ${sqlitePath}`);
  console.log(`To MySQL: ${config.mysql.database}`);

  // Tables to migrate in order (respecting foreign keys)
  // Note: sessions table skipped - goes to Redis
  const tables = [
    { name: 'users', skipColumns: [] },
    { name: 'categories', skipColumns: [] },
    { name: 'tags', skipColumns: [] },
    { name: 'posts', skipColumns: [] },
    { name: 'replies', skipColumns: [] },
    { name: 'post_tags', skipColumns: [] },
    { name: 'bookmarks', skipColumns: [] },
    { name: 'notifications', skipColumns: [] },
    { name: 'messages', skipColumns: [] },
    { name: 'attachments', skipColumns: [] },
    { name: 'resource_categories', skipColumns: [] },
    { name: 'resources', skipColumns: ['category'] }, // Skip old TEXT category column
    { name: 'resource_versions', skipColumns: [] },
    { name: 'operation_logs', skipColumns: [] },
    { name: 'settings', skipColumns: [], keyColumn: 'key' }, // key is reserved word
    { name: 'bans', skipColumns: [] }
  ];

  let totalRows = 0;

  for (const table of tables) {
    console.log(`\nMigrating table: ${table.name}`);

    try {
      // Get count
      const countRow = sqlite.prepare(`SELECT COUNT(*) as cnt FROM ${table.name}`).get();
      const rowCount = countRow.cnt;

      if (rowCount === 0) {
        console.log(`  Table ${table.name} is empty, skipping`);
        continue;
      }

      console.log(`  Found ${rowCount} rows`);

      // Get all rows from SQLite
      const rows = sqlite.prepare(`SELECT * FROM ${table.name}`).all();

      if (rows.length === 0) continue;

      // Get column names (filter skipped columns)
      const allColumns = Object.keys(rows[0]);
      const columns = allColumns.filter(c => !table.skipColumns.includes(c));

      // Insert into MySQL in batches
      const batches = Math.ceil(rows.length / BATCH_SIZE);
      let inserted = 0;

      for (let i = 0; i < batches; i++) {
        const batchRows = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);

        // Build INSERT statement
        const columnList = columns.map(c => table.keyColumn === c ? `\`${c}\`` : c).join(', ');
        const placeholders = columns.map(() => '?').join(', ');

        // Use INSERT IGNORE to skip duplicates
        const sql = `INSERT IGNORE INTO ${table.name} (${columnList}) VALUES (${placeholders})`;

        for (const row of batchRows) {
          const values = columns.map(col => {
            const val = row[col];
            // Handle SQLite empty strings vs NULL
            if (val === '' && (col === 'bio' || col === 'description')) return null;
            return val;
          });

          try {
            await mysql.execute(sql, values);
            inserted++;
          } catch (err) {
            if (!err.message.includes('Duplicate')) {
              console.warn(`  Insert error: ${err.message}`);
            }
          }
        }

        console.log(`  Batch ${i + 1}/${batches} processed`);
      }

      console.log(`  Migrated ${inserted}/${rowCount} rows`);
      totalRows += inserted;

    } catch (error) {
      console.error(`  Error migrating ${table.name}:`, error.message);
    }
  }

  // Migrate sessions to session_audit table
  console.log('\nMigrating sessions to session_audit...');
  try {
    const sessions = sqlite.prepare(`SELECT * FROM sessions`).all();
    if (sessions.length > 0) {
      for (const session of sessions) {
        await mysql.execute(
          `INSERT IGNORE INTO session_audit (user_id, session_token, mindauth_token, action, created_at)
           VALUES (?, ?, ?, 'migrated', ?)`,
          [session.user_id, session.session_token, session.mindauth_token || null, session.created_at]
        );
      }
      console.log(`  Migrated ${sessions.length} session records to audit table`);
      console.log(`  Note: Active sessions will be created in Redis on user login`);
    }
  } catch (err) {
    console.warn(`  Session migration skipped: ${err.message}`);
  }

  sqlite.close();
  await mysql.close();
  console.log(`\n=== Migration complete: ${totalRows} total rows migrated ===`);
}

// Run if called directly
if (require.main === module) {
  migrateData().catch(console.error);
}

module.exports = migrateData;