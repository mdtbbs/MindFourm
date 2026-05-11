const db = require('./src/database');
db.initialize();
const crypto = require('crypto');

// Create test user
const result = db.prepare(
  "INSERT INTO users (mindauth_id, username, email, role) VALUES (?, ?, ?, ?)"
).run(9999, 'testuser', 'test@example.com', 'admin');

const userId = result.lastInsertRowid;
console.log('Created user with ID:', userId);

// Create session token
const sessionToken = crypto.randomBytes(32).toString('hex');
const maxAge = 24 * 60 * 60 * 1000; // 24 hours
const expiresAt = new Date(Date.now() + maxAge);

db.prepare(
  "INSERT INTO sessions (user_id, session_token, mindauth_token, expires_at) VALUES (?, ?, NULL, ?)"
).run(userId, sessionToken, expiresAt.toISOString());

console.log('Session token:', sessionToken);

// Create test category
const cat = db.prepare(
  "INSERT INTO categories (name, slug, sort_order, is_active) VALUES (?, ?, ?, ?)"
).run('测试分类', 'test', 1, 1);

console.log('Created category with ID:', cat.lastInsertRowid);

// Create test tag
const tag = db.prepare(
  "INSERT INTO tags (name, slug) VALUES (?, ?)"
).run('测试标签', 'test');

console.log('Created tag with ID:', tag.lastInsertRowid);

console.log('\nTest data created successfully');
