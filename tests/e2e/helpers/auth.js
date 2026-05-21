/**
 * Test authentication helper
 */
const crypto = require('crypto');
const Database = require('../fixtures/test-db');

/**
 * Create a test session for the given user.
 * Returns the session token that can be used as a cookie value.
 */
function createTestSession(userId, mindauthToken = null) {
  const db = Database.getTestDb();
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 86400000 * 7); // 7 days

  db.prepare(`
    INSERT INTO sessions (user_id, session_token, mindauth_token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, sessionToken, mindauthToken, expiresAt.toISOString());

  return sessionToken;
}

/**
 * Delete a test session
 */
function deleteTestSession(sessionToken) {
  const db = Database.getTestDb();
  db.prepare('DELETE FROM sessions WHERE session_token = ?').run(sessionToken);
}

/**
 * Create a test user and session.
 * Returns { userId, username, role, sessionToken, cookieValue }
 */
function createTestIdentity(userData = {}) {
  const db = Database.getTestDb();
  const {
    username = `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    email = `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
    role = 'user',
    mindauth_id = Date.now() * 1000 + Math.floor(Math.random() * 999999),
  } = userData;

  const result = db.prepare(`
    INSERT INTO users (username, email, role, mindauth_id, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(username, email, role, mindauth_id);

  const userId = result.lastInsertRowid;
  const sessionToken = createTestSession(userId);

  return {
    userId,
    username,
    email,
    role,
    mindauth_id,
    sessionToken,
    cookieValue: `forum_session=${sessionToken}`,
  };
}

/**
 * Clean up test identity (user and all their data)
 */
function deleteTestIdentity(userId) {
  const db = Database.getTestDb();
  // Clean up in order (respecting FK constraints)
  db.prepare('DELETE FROM resources WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM messages WHERE sender_id = ?').run(userId);
  db.prepare('DELETE FROM messages WHERE recipient_id = ?').run(userId);
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM replies WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM posts WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

module.exports = { createTestSession, deleteTestSession, createTestIdentity, deleteTestIdentity };
