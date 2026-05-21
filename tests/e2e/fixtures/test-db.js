/**
 * Test database helper - connects to the production DB (same as backend)
 * Tests clean up their own data after each run.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use the same DB as the backend
const TEST_DB_PATH = path.resolve(__dirname, '../../../data/forum.db');

function getTestDb() {
  const db = new Database(TEST_DB_PATH, { readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function resetTestData() {
  const db = getTestDb();
  db.exec(`
    DELETE FROM resources WHERE uploader_id > 0;
    DELETE FROM attachments WHERE post_id > 0;
    DELETE FROM messages WHERE sender_id > 0;
    DELETE FROM notifications WHERE user_id > 0;
    DELETE FROM replies WHERE post_id > 0;
    DELETE FROM posts WHERE user_id > 0;
    DELETE FROM categories WHERE id > 100;
    DELETE FROM tags WHERE id > 100;
  `);
}

/**
 * Create a test user.
 * Returns { id, username, email, role, mindauth_id }
 */
function createTestUser(db, userData = {}) {
  const {
    username = `test_user_${Date.now()}`,
    email = `test_${Date.now()}@example.com`,
    role = 'user',
    mindauth_id = Date.now() + Math.floor(Math.random() * 10000),
  } = userData;

  const result = db.prepare(`
    INSERT INTO users (username, email, role, mindauth_id, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(username, email, role, mindauth_id);

  return { id: result.lastInsertRowid, username, email, role, mindauth_id };
}

function deleteTestUser(db, userId) {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

module.exports = { getTestDb, resetTestData, createTestUser, deleteTestUser, TEST_DB_PATH };
