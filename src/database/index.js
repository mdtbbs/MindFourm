const mysql = require('./mysql');
const redis = require('./redis');
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function initialize() {
  // Initialize MySQL
  const pool = mysql.initialize();

  // Check if schema needs to be run (tables don't exist)
  const [tables] = await pool.execute("SHOW TABLES LIKE 'users'");
  if (tables.length === 0) {
    console.log('Running MySQL schema initialization...');
    const schemaPath = path.join(__dirname, '../config/mysql.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split by semicolon and execute each statement
    const statements = schema.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim() && !stmt.trim().startsWith('--')) {
        try {
          await pool.execute(stmt);
        } catch (err) {
          // Ignore duplicate table/column errors
          if (!err.message.includes('already exists')) {
            console.warn('Schema statement error:', err.message);
          }
        }
      }
    }
    console.log('MySQL schema initialized');
  }

  // Run migrations for new columns
  try {
    // Add like_count to posts if not exists
    const [postColumns] = await pool.execute("SHOW COLUMNS FROM posts LIKE 'like_count'");
    if (postColumns.length === 0) {
      await pool.execute("ALTER TABLE posts ADD COLUMN like_count INT DEFAULT 0 AFTER view_count");
      console.log('Added like_count column to posts');
    }

    // Add like_count to replies if not exists
    const [replyColumns] = await pool.execute("SHOW COLUMNS FROM replies LIKE 'like_count'");
    if (replyColumns.length === 0) {
      await pool.execute("ALTER TABLE replies ADD COLUMN like_count INT DEFAULT 0 AFTER status");
      console.log('Added like_count column to replies');
    }
  } catch (err) {
    // Tables might not exist yet, ignore
    if (!err.message.includes('doesn\'t exist')) {
      console.warn('Migration error:', err.message);
    }
  }

  // Initialize Redis
  redis.initialize();

  console.log('Database initialization complete (MySQL + Redis)');
  return { mysql, redis };
}

async function close() {
  await mysql.close();
  await redis.close();
  console.log('Database connections closed');
}

module.exports = {
  initialize,
  close,
  mysql,
  redis,
  // Convenience aliases matching old SQLite API
  query: mysql.query,
  queryOne: mysql.queryOne,
  execute: mysql.execute,
  transaction: mysql.transaction
};