const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;

function initialize() {
  const dbPath = config.database.path;
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  // Add username/email columns if they don't exist (migration)
  try {
    db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  } catch (e) {
    if (!e.message.includes('duplicate')) console.warn('Schema migration: username column already exists');
  }
  try {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  } catch (e) {
    if (!e.message.includes('duplicate')) console.warn('Schema migration: email column already exists');
  }

  // Phase 2: add avatar_url and bio to users
  try {
    db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
  } catch (e) {
    if (!e.message.includes('duplicate')) console.warn('Schema migration: avatar_url column already exists');
  }
  try {
    db.exec('ALTER TABLE users ADD COLUMN bio TEXT DEFAULT \'\'');
  } catch (e) {
    if (!e.message.includes('duplicate')) console.warn('Schema migration: bio column already exists');
  }

  // Phase 3: add server_id and post_type to posts for server association
  try {
    db.exec('ALTER TABLE posts ADD COLUMN server_id INTEGER NULL');
  } catch (e) {
    if (!e.message.includes('duplicate')) console.warn('Schema migration: server_id column already exists');
  }
  try {
    db.exec('ALTER TABLE posts ADD COLUMN post_type TEXT DEFAULT \'normal\'');
  } catch (e) {
    if (!e.message.includes('duplicate')) console.warn('Schema migration: post_type column already exists');
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_posts_server_id ON posts(server_id)');
  } catch (e) {
    console.warn('Schema migration: idx_posts_server_id creation failed', e.message);
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_posts_post_type ON posts(post_type)');
  } catch (e) {
    console.warn('Schema migration: idx_posts_post_type creation failed', e.message);
  }

  // Seed default settings for admin panel
  const SettingService = require('../services/setting.service');
  SettingService.seedDefaults();

  console.log(`Database initialized at ${dbPath}`);
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initialize() first.');
  }
  return db;
}

function close() {
  if (db) {
    db.close();
    db = null;
    console.log('Database closed');
  }
}

const dbProxy = new Proxy({}, {
  get(target, prop) {
    if (prop === 'initialize') return initialize;
    if (prop === 'close') return close;
    if (prop === 'getDb') return getDb;
    const database = getDb();
    const value = database[prop];
    if (typeof value === 'function') {
      return value.bind(database);
    }
    return value;
  }
});

module.exports = dbProxy;
