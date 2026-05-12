const db = require('./src/database');
db.initialize();
const crypto = require('crypto');

// Create test user (skip if exists)
const userResult = db.prepare("SELECT id FROM users WHERE mindauth_id = 9999").get();
let userId;
if (userResult) {
  userId = userResult.id;
  console.log('User already exists with ID:', userId);
} else {
  const result = db.prepare(
    "INSERT INTO users (mindauth_id, username, email, role) VALUES (?, ?, ?, ?)"
  ).run(9999, 'testuser', 'test@example.com', 'admin');
  userId = result.lastInsertRowid;
  console.log('Created user with ID:', userId);
}

// Session token (delete old ones first)
db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
const sessionToken = crypto.randomBytes(32).toString('hex');
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
db.prepare(
  "INSERT INTO sessions (user_id, session_token, mindauth_token, expires_at) VALUES (?, ?, NULL, ?)"
).run(userId, sessionToken, expiresAt.toISOString());
console.log('Session token:', sessionToken);

// Create test category (skip if exists)
const catResult = db.prepare("SELECT id FROM categories WHERE slug = 'test'").get();
if (!catResult) {
  db.prepare("INSERT INTO categories (name, slug, sort_order, is_active) VALUES (?, ?, ?, ?)")
    .run('测试分类', 'test', 1, 1);
  console.log('Created category');
} else {
  console.log('Category exists (id:', catResult.id + ')');
}

// Create test tag (skip if exists)
const tagResult = db.prepare("SELECT id FROM tags WHERE slug = 'test'").get();
if (!tagResult) {
  db.prepare("INSERT INTO tags (name, slug) VALUES (?, ?)").run('测试标签', 'test');
  console.log('Created tag');
} else {
  console.log('Tag exists (id:', tagResult.id + ')');
}

console.log('\nTest data ready');
