# SQLite → MySQL + Redis Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate MindForum from SQLite (better-sqlite3) to MySQL for persistent data and Redis for session/cache storage.

**Architecture:** 
- MySQL stores all persistent data (users, posts, replies, resources, etc.)
- Redis handles session tokens, notification cache, and rate limiting counters
- Migration uses mysql2 promise-based async API, replacing better-sqlite3 sync API
- MySQL path: `F:\MySQL\bin`

**Tech Stack:** mysql2, ioredis, async/await patterns throughout service layer

---

## File Structure

### Created Files
- `src/database/mysql.js` - MySQL connection pool and query utilities
- `src/database/redis.js` - Redis client for session/cache
- `src/database/migrate.js` - Data migration script (SQLite → MySQL)
- `src/config/mysql.sql` - MySQL schema (adapted from schema.sql)
- `tests/database/mysql.test.js` - MySQL connection tests
- `tests/database/redis.test.js` - Redis connection tests

### Modified Files
- `src/config/index.js` - Add MySQL/Redis config
- `src/database/index.js` - Switch from SQLite to MySQL + Redis exports
- `src/services/*.js` - All 21 service files converted to async
- `src/middleware/auth.js` - Use Redis for session validation
- `src/middleware/rate-limit.js` - Use Redis counters
- `src/index.js` - Initialize both MySQL and Redis
- `package.json` - Replace better-sqlite3 with mysql2 and ioredis
- `.env.example` - Add MySQL/Redis connection params

---

## Phase 1: Infrastructure Setup

### Task 1: Install MySQL and Redis Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add mysql2 and ioredis, remove better-sqlite3**

```json
{
  "dependencies": {
    "mysql2": "^3.11.0",
    "ioredis": "^5.4.1"
  }
}
```

Remove: `"better-sqlite3": "^11.7.0"`

- [ ] **Step 2: Run npm install**

Run: `cd G:\MindProject\MindFourm && npm install`
Expected: mysql2 and ioredis installed successfully

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: replace better-sqlite3 with mysql2 and ioredis"
```

---

### Task 2: Update Configuration

**Files:**
- Modify: `src/config/index.js`

- [ ] **Step 1: Add MySQL and Redis configuration**

```javascript
require('dotenv').config();
const path = require('path');

module.exports = {
  app: {
    port: parseInt(process.env.PORT, 10) || 4000,
    env: process.env.NODE_ENV || 'development',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000'
  },

  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mindforum',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB, 10) || 0
  },

  mindauth: {
    baseUrl: process.env.MINDAUTH_URL || 'http://localhost:4001',
    clientId: process.env.MINDAUTH_CLIENT_ID,
    clientSecret: process.env.MINDAUTH_CLIENT_SECRET,
    callbackUrl: process.env.MINDAUTH_CALLBACK_URL || 'http://localhost:4000/api/auth/callback'
  },

  easymanager: {
    baseUrl: process.env.EASYMANAGER_URL || 'http://localhost:5001',
    apiKey: process.env.EASYMANAGER_API_KEY || 'forum-service-key-dev'
  },

  session: {
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
};
```

- [ ] **Step 2: Create .env.example with MySQL/Redis template**

Create: `.env.example`

```
# App
PORT=4000
BASE_URL=http://localhost:3000

# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=mindforum

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# MindAuth
MINDAUTH_URL=http://localhost:4001
MINDAUTH_CLIENT_ID=your_client_id
MINDAUTH_CLIENT_SECRET=your_client_secret
MINDAUTH_CALLBACK_URL=http://localhost:4000/api/auth/callback

# EasyManager
EASYMANAGER_URL=http://localhost:5001
EASYMANAGER_API_KEY=forum-service-key-dev
```

- [ ] **Step 3: Commit**

```bash
git add src/config/index.js .env.example
git commit -m "config: add MySQL and Redis configuration"
```

---

### Task 3: Create MySQL Connection Module

**Files:**
- Create: `src/database/mysql.js`

- [ ] **Step 1: Write MySQL pool module**

```javascript
const mysql = require('mysql2/promise');
const config = require('../config');

let pool = null;

function initialize() {
  pool = mysql.createPool(config.mysql);
  console.log(`MySQL pool initialized: ${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`);
  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error('MySQL pool not initialized. Call initialize() first.');
  }
  return pool;
}

async function query(sql, params = []) {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function execute(sql, params = []) {
  const pool = getPool();
  const [result] = await pool.execute(sql, params);
  return result;
}

async function transaction(callback) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('MySQL pool closed');
  }
}

module.exports = {
  initialize,
  getPool,
  query,
  queryOne,
  execute,
  transaction,
  close
};
```

- [ ] **Step 2: Write failing test for MySQL connection**

Create: `tests/database/mysql.test.js`

```javascript
const assert = require('assert');
const mysql = require('../../src/database/mysql');

describe('MySQL Connection', function() {
  this.timeout(10000);

  before(async function() {
    // Skip if MySQL not configured
    if (!process.env.MYSQL_HOST) {
      this.skip();
    }
    mysql.initialize();
  });

  after(async function() {
    await mysql.close();
  });

  it('should connect and execute simple query', async function() {
    const result = await mysql.query('SELECT 1 as test');
    assert.strictEqual(result[0].test, 1);
  });

  it('should handle queryOne returning null for no results', async function() {
    const result = await mysql.queryOne('SELECT 1 as test WHERE 1 = 2');
    assert.strictEqual(result, null);
  });
});
```

- [ ] **Step 3: Run test (will fail if MySQL not running)**

Run: `cd G:\MindProject\MindFourm && npm test` (if test runner configured) or manual verification
Expected: Tests pass when MySQL is running with configured credentials

- [ ] **Step 4: Commit**

```bash
git add src/database/mysql.js tests/database/mysql.test.js
git commit -m "feat: add MySQL connection pool module"
```

---

### Task 4: Create Redis Connection Module

**Files:**
- Create: `src/database/redis.js`

- [ ] **Step 1: Write Redis client module**

```javascript
const Redis = require('ioredis');
const config = require('../config');

let client = null;

function initialize() {
  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    retryStrategy: (times) => {
      if (times > 3) {
        console.error('Redis connection failed after 3 retries');
        return null;
      }
      return Math.min(times * 100, 2000);
    }
  });
  
  client.on('connect', () => {
    console.log(`Redis connected: ${config.redis.host}:${config.redis.port}`);
  });
  
  client.on('error', (err) => {
    console.error('Redis error:', err.message);
  });
  
  return client;
}

function getClient() {
  if (!client) {
    throw new Error('Redis client not initialized. Call initialize() first.');
  }
  return client;
}

async function get(key) {
  return getClient().get(key);
}

async function set(key, value, ttlSeconds = null) {
  const client = getClient();
  if (ttlSeconds) {
    return client.set(key, value, 'EX', ttlSeconds);
  }
  return client.set(key, value);
}

async function del(key) {
  return getClient().del(key);
}

async function exists(key) {
  return getClient().exists(key);
}

async function incr(key) {
  return getClient().incr(key);
}

async function expire(key, seconds) {
  return getClient().expire(key, seconds);
}

async function ttl(key) {
  return getClient().ttl(key);
}

async function keys(pattern) {
  return getClient().keys(pattern);
}

async function hset(key, field, value) {
  return getClient().hset(key, field, value);
}

async function hget(key, field) {
  return getClient().hget(key, field);
}

async function hgetall(key) {
  return getClient().hgetall(key);
}

async function hdel(key, field) {
  return getClient().hdel(key, field);
}

async function close() {
  if (client) {
    await client.quit();
    client = null;
    console.log('Redis client closed');
  }
}

module.exports = {
  initialize,
  getClient,
  get,
  set,
  del,
  exists,
  incr,
  expire,
  ttl,
  keys,
  hset,
  hget,
  hgetall,
  hdel,
  close
};
```

- [ ] **Step 2: Write failing test for Redis connection**

Create: `tests/database/redis.test.js`

```javascript
const assert = require('assert');
const redis = require('../../src/database/redis');

describe('Redis Connection', function() {
  this.timeout(10000);

  before(async function() {
    if (!process.env.REDIS_HOST) {
      this.skip();
    }
    redis.initialize();
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async function() {
    await redis.close();
  });

  it('should set and get a value', async function() {
    await redis.set('test:key', 'testvalue', 10);
    const value = await redis.get('test:key');
    assert.strictEqual(value, 'testvalue');
    await redis.del('test:key');
  });

  it('should increment a counter', async function() {
    await redis.set('test:counter', '0', 10);
    const result = await redis.incr('test:counter');
    assert.strictEqual(result, 1);
    await redis.del('test:counter');
  });

  it('should handle hash operations', async function() {
    await redis.hset('test:hash', 'field1', 'value1');
    const value = await redis.hget('test:hash', 'field1');
    assert.strictEqual(value, 'value1');
    await redis.del('test:hash');
  });
});
```

- [ ] **Step 3: Run test**

Run: Verify Redis connection tests pass

- [ ] **Step 4: Commit**

```bash
git add src/database/redis.js tests/database/redis.test.js
git commit -m "feat: add Redis client module"
```

---

### Task 5: Create MySQL Schema File

**Files:**
- Create: `src/config/mysql.sql`

- [ ] **Step 1: Convert SQLite schema to MySQL syntax**

Create: `src/config/mysql.sql`

Key changes:
- `AUTOINCREMENT` → `AUTO_INCREMENT`
- `INTEGER PRIMARY KEY` → `INT PRIMARY KEY AUTO_INCREMENT`
- `TEXT` → `VARCHAR(255)` or `TEXT` (MySQL supports TEXT)
- `DATETIME DEFAULT CURRENT_TIMESTAMP` → `DATETIME DEFAULT CURRENT_TIMESTAMP`
- Remove `IF NOT EXISTS` from ALTER (MySQL handles differently)

```sql
-- MindForum MySQL Schema
-- Run this to initialize the database

CREATE DATABASE IF NOT EXISTS mindforum CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mindforum;

-- users
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    mindauth_id INT UNIQUE NOT NULL,
    username VARCHAR(255),
    email VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    avatar_url VARCHAR(500),
    bio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_mindauth_id (mindauth_id),
    INDEX idx_users_role (role),
    INDEX idx_users_username (username),
    INDEX idx_users_email (email)
);

-- categories
CREATE TABLE IF NOT EXISTS categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    sort_order INT DEFAULT 0,
    is_active TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_categories_slug (slug)
);

-- posts
CREATE TABLE IF NOT EXISTS posts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    category_id INT,
    server_id INT NULL,
    post_type VARCHAR(50) DEFAULT 'normal',
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    is_pinned TINYINT DEFAULT 0,
    view_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_posts_user_id (user_id),
    INDEX idx_posts_category_id (category_id),
    INDEX idx_posts_status (status),
    INDEX idx_posts_deleted_at (deleted_at),
    INDEX idx_posts_pinned_created (is_pinned DESC, created_at DESC),
    INDEX idx_posts_server_id (server_id),
    INDEX idx_posts_post_type (post_type),
    INDEX idx_posts_list (deleted_at, status, is_pinned DESC, created_at DESC)
);

-- replies
CREATE TABLE IF NOT EXISTS replies (
    id INT PRIMARY KEY AUTO_INCREMENT,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    parent_reply_id INT,
    content TEXT NOT NULL,
    content_html TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_reply_id) REFERENCES replies(id) ON DELETE CASCADE,
    INDEX idx_replies_post_id (post_id),
    INDEX idx_replies_user_id (user_id),
    INDEX idx_replies_parent_id (parent_reply_id),
    INDEX idx_replies_status (status),
    INDEX idx_replies_post_created (post_id, created_at),
    INDEX idx_replies_list (post_id, deleted_at, created_at ASC)
);

-- tags
CREATE TABLE IF NOT EXISTS tags (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tags_slug (slug)
);

-- post_tags
CREATE TABLE IF NOT EXISTS post_tags (
    post_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    INDEX idx_post_tags_tag (tag_id)
);

-- sessions (Redis will handle active sessions, this is for audit)
CREATE TABLE IF NOT EXISTS session_audit (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    session_token VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'create', 'destroy', 'expire'
    ip_address VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_session_audit_user (user_id),
    INDEX idx_session_audit_token (session_token)
);

-- operation_logs
CREATE TABLE IF NOT EXISTS operation_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(255) NOT NULL,
    target_type VARCHAR(100),
    target_id INT,
    details TEXT,
    ip_address VARCHAR(50),
    user_agent VARCHAR(500),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_logs_user_id (user_id),
    INDEX idx_logs_action (action),
    INDEX idx_logs_target (target_type, target_id),
    INDEX idx_logs_created_at (created_at DESC),
    INDEX idx_logs_user_action (user_id, action),
    INDEX idx_logs_list (created_at DESC, user_id, action)
);

-- settings
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_settings_category (category)
);

-- bans
CREATE TABLE IF NOT EXISTS bans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ban_type VARCHAR(50) NOT NULL,
    value VARCHAR(255) NOT NULL,
    reason TEXT,
    created_by INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active TINYINT DEFAULT 1,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_bans_type (ban_type),
    INDEX idx_bans_active (is_active),
    INDEX idx_bans_value (value),
    INDEX idx_bans_lookup (ban_type, value, is_active)
);

-- bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    post_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_bookmark (user_id, post_id),
    INDEX idx_bookmarks_user (user_id, created_at DESC),
    INDEX idx_bookmarks_post (post_id)
);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    actor_id INT NOT NULL,
    post_id INT,
    reply_id INT,
    content TEXT,
    is_read TINYINT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
    FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE SET NULL,
    INDEX idx_notifications_user (user_id, is_read, created_at DESC),
    INDEX idx_notifications_actor (actor_id)
);

-- attachments
CREATE TABLE IF NOT EXISTS attachments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    post_id INT,
    reply_id INT,
    user_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    download_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_attachments_post (post_id),
    INDEX idx_attachments_reply (reply_id),
    INDEX idx_attachments_user (user_id)
);

-- messages
CREATE TABLE IF NOT EXISTS messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    sender_id INT NOT NULL,
    recipient_id INT NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    is_read TINYINT DEFAULT 0,
    read_at DATETIME NULL,
    deleted_by_sender TINYINT DEFAULT 0,
    deleted_by_recipient TINYINT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_messages_sender (sender_id, created_at DESC),
    INDEX idx_messages_recipient (recipient_id, is_read, created_at DESC),
    INDEX idx_messages_conversation (sender_id, recipient_id, created_at DESC),
    INDEX idx_messages_deleted (deleted_by_sender, deleted_by_recipient)
);

-- resource_categories
CREATE TABLE IF NOT EXISTS resource_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50),
    sort_order INT DEFAULT 0,
    is_active TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_resource_categories_slug (slug),
    INDEX idx_resource_categories_active (is_active)
);

-- resources
CREATE TABLE IF NOT EXISTS resources (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'file',
    file_name VARCHAR(255),
    file_path VARCHAR(500),
    file_size INT DEFAULT 0,
    mime_type VARCHAR(100),
    external_url VARCHAR(500),
    version VARCHAR(50),
    content TEXT,
    content_html TEXT,
    category_id INT,
    download_count INT DEFAULT 0,
    is_public TINYINT DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'approved',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES resource_categories(id) ON DELETE SET NULL,
    INDEX idx_resources_user (user_id),
    INDEX idx_resources_status (status),
    INDEX idx_resources_public (is_public, status),
    INDEX idx_resources_created (created_at DESC),
    INDEX idx_resources_category (category_id),
    INDEX idx_resources_type (resource_type)
);

-- resource_versions
CREATE TABLE IF NOT EXISTS resource_versions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    resource_id INT NOT NULL,
    version VARCHAR(50) NOT NULL,
    file_path VARCHAR(500),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    UNIQUE KEY unique_version (resource_id, version),
    INDEX idx_resource_versions_resource (resource_id)
);
```

- [ ] **Step 2: Initialize MySQL database**

Run: `F:\MySQL\bin\mysql.exe -u root -p < G:\MindProject\MindFourm\src\config\mysql.sql`
Expected: Database and tables created successfully

- [ ] **Step 3: Commit**

```bash
git add src/config/mysql.sql
git commit -m "feat: add MySQL schema for MindForum"
```

---

### Task 6: Update Database Index Module

**Files:**
- Modify: `src/database/index.js`

- [ ] **Step 1: Replace SQLite with MySQL + Redis exports**

```javascript
const mysql = require('./mysql');
const redis = require('./redis');
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function initialize() {
  // Initialize MySQL
  const pool = mysql.initialize();
  
  // Run schema if tables don't exist
  const [tables] = await pool.execute("SHOW TABLES LIKE 'users'");
  if (tables.length === 0) {
    const schemaPath = path.join(__dirname, '../config/mysql.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    // Split by semicolon and execute each statement
    const statements = schema.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        await pool.execute(stmt);
      }
    }
    console.log('MySQL schema initialized');
  }
  
  // Initialize Redis
  redis.initialize();
  
  // Seed default settings for admin panel
  const SettingService = require('../services/setting.service');
  await SettingService.seedDefaults();
  
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
```

- [ ] **Step 2: Commit**

```bash
git add src/database/index.js
git commit -m "refactor: switch database module to MySQL + Redis"
```

---

### Task 7: Update Entry Point

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Update initialization to async**

Read current `src/index.js` and modify:

```javascript
require('dotenv').config();
const app = require('./app');
const db = require('./database');
const config = require('./config');

async function start() {
  try {
    await db.initialize();
    
    app.listen(config.app.port, () => {
      console.log(`MindForum running on port ${config.app.port}`);
    });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

start();

// Handle shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await db.close();
  process.exit(0);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/index.js
git commit -m "refactor: update entry point for async database init"
```

---

## Phase 2: Service Layer Migration (Async Conversion)

### Task 8: Migrate AuthService (Critical - Session to Redis)

**Files:**
- Modify: `src/services/auth.service.js`

- [ ] **Step 1: Convert to async, move sessions to Redis**

```javascript
const crypto = require('crypto');
const config = require('../config');
const db = require('../database');
const redis = require('../database/redis');

class AuthService {
  static async exchangeCode(code) {
    try {
      const response = await fetch(`${config.mindauth.baseUrl}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: config.mindauth.clientId,
          client_secret: config.mindauth.clientSecret
        })
      });

      const result = await response.json();
      return result.success ? result.user : null;
    } catch (error) {
      console.error('MindAuth exchange error:', error);
      return null;
    }
  }

  static async verifyMindAuthSession(sessionToken) {
    try {
      const response = await fetch(`${config.mindauth.baseUrl}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: sessionToken })
      });

      const result = await response.json();
      return result.success ? result.user : null;
    } catch (error) {
      console.error('MindAuth verify error:', error);
      return null;
    }
  }

  static async getOrCreateUser(mindauthUser) {
    let user = await db.queryOne('SELECT * FROM users WHERE mindauth_id = ?', [mindauthUser.id]);

    if (!user) {
      const result = await db.execute(
        'INSERT INTO users (mindauth_id, username, email, role) VALUES (?, ?, ?, ?)',
        [mindauthUser.id, mindauthUser.username, mindauthUser.email, 'user']
      );
      user = await db.queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
    } else {
      if (user.username !== mindauthUser.username || user.email !== mindauthUser.email) {
        await db.execute(
          'UPDATE users SET username = ?, email = ? WHERE mindauth_id = ?',
          [mindauthUser.username, mindauthUser.email, mindauthUser.id]
        );
        user.username = mindauthUser.username;
        user.email = mindauthUser.email;
      }
    }

    return user;
  }

  static async createSession(userId, ipAddress = null) {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const ttlSeconds = Math.floor(config.session.maxAge / 1000);

    // Store session in Redis
    await redis.hset(`session:${sessionToken}`, 'user_id', userId.toString());
    await redis.expire(`session:${sessionToken}`, ttlSeconds);

    // Optionally log session creation to MySQL audit table
    await db.execute(
      'INSERT INTO session_audit (user_id, session_token, action, ip_address) VALUES (?, ?, ?, ?)',
      [userId, sessionToken, 'create', ipAddress]
    );

    return sessionToken;
  }

  static async validateSession(sessionToken) {
    // Check Redis first
    const sessionData = await redis.hgetall(`session:${sessionToken}`);
    
    if (!sessionData || !sessionData.user_id) {
      return null;
    }

    // Get user info from MySQL
    const user = await db.queryOne(
      'SELECT id, role, mindauth_id, username, email, created_at FROM users WHERE id = ?',
      [parseInt(sessionData.user_id, 10)]
    );

    if (!user) {
      await redis.del(`session:${sessionToken}`);
      return null;
    }

    return {
      user_id: user.id,
      role: user.role,
      mindauth_id: user.mindauth_id,
      username: user.username,
      email: user.email,
      user_created_at: user.created_at
    };
  }

  static async destroySession(sessionToken) {
    await redis.del(`session:${sessionToken}`);
    
    // Log to audit table
    const sessionData = await redis.hgetall(`session:${sessionToken}`);
    if (sessionData && sessionData.user_id) {
      await db.execute(
        'INSERT INTO session_audit (user_id, session_token, action) VALUES (?, ?, ?)',
        [parseInt(sessionData.user_id, 10), sessionToken, 'destroy']
      );
    }
  }

  static async destroyAllUserSessions(userId) {
    // Find all session keys for this user
    const keys = await redis.keys('session:*');
    for (const key of keys) {
      const data = await redis.hget(key, 'user_id');
      if (data === userId.toString()) {
        await redis.del(key);
      }
    }
  }

  static async cleanExpiredSessions() {
    // Redis handles expiration automatically via TTL
    // This method can be used for additional cleanup if needed
    console.log('Session cleanup handled by Redis TTL');
  }
}

module.exports = AuthService;
```

- [ ] **Step 2: Update auth middleware to async**

Modify: `src/middleware/auth.js`

```javascript
const config = require('../config');
const AuthService = require('../services/auth.service');

function authMiddleware(options = {}) {
  const { required = true, roles = [] } = options;

  return async (ctx, next) => {
    const sessionToken = ctx.headers['authorization']?.replace('Bearer ', '')
      || ctx.cookies.get('forum_session');

    if (!sessionToken) {
      if (required) {
        ctx.status = 401;
        ctx.body = { success: false, message: 'Not authenticated' };
        return;
      }
      ctx.state.user = null;
      return next();
    }

    const session = await AuthService.validateSession(sessionToken);

    if (!session) {
      if (required) {
        ctx.status = 401;
        ctx.body = { success: false, message: 'Session expired or invalid' };
        return;
      }
      ctx.state.user = null;
      return next();
    }

    ctx.state.user = {
      id: session.user_id,
      mindauthId: session.mindauth_id,
      username: session.username,
      email: session.email,
      role: session.role,
      createdAt: session.user_created_at
    };

    if (roles.length > 0 && !roles.includes(ctx.state.user.role)) {
      ctx.status = 403;
      ctx.body = { success: false, message: 'Insufficient permissions' };
      return;
    }

    return next();
  };
}

module.exports = { authMiddleware };
```

- [ ] **Step 3: Commit**

```bash
git add src/services/auth.service.js src/middleware/auth.js
git commit -m "refactor: migrate AuthService to async with Redis sessions"
```

---

### Task 9: Migrate UserService

**Files:**
- Modify: `src/services/user.service.js`

- [ ] **Step 1: Convert all methods to async**

```javascript
const db = require('../database');

class UserService {
  static async getById(id) {
    return db.queryOne(`
      SELECT u.id, u.mindauth_id, u.username, u.email, u.role, u.avatar_url, u.bio, u.created_at,
             (SELECT COUNT(*) FROM posts WHERE user_id = u.id AND deleted_at IS NULL) as post_count,
             (SELECT COUNT(*) FROM replies WHERE user_id = u.id AND deleted_at IS NULL) as reply_count
      FROM users u
      WHERE u.id = ?
    `, [id]);
  }

  static async getByMindAuthId(mindauthId) {
    return db.queryOne('SELECT * FROM users WHERE mindauth_id = ?', [mindauthId]);
  }

  static async updateProfile(id, { username, bio }) {
    const updates = {};
    if (username !== undefined) updates.username = username;
    if (bio !== undefined) updates.bio = bio;

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];

    await db.execute(`UPDATE users SET ${fields} WHERE id = ?`, values);
    return this.getById(id);
  }

  static async updateAvatar(id, avatarUrl) {
    await db.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, id]);
    return this.getById(id);
  }

  static async removeAvatar(id) {
    await db.execute('UPDATE users SET avatar_url = NULL WHERE id = ?', [id]);
    return this.getById(id);
  }

  static async getRepliesByUserId(userId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;

    const replies = await db.query(`
      SELECT r.*, u.mindauth_id as author_mindauth_id, u.role as author_role,
             p.title as post_title
      FROM replies r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN posts p ON r.post_id = p.id
      WHERE r.user_id = ? AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    const countResult = await db.queryOne(`
      SELECT COUNT(*) as total FROM replies
      WHERE user_id = ? AND deleted_at IS NULL
    `, [userId]);

    return {
      data: replies,
      pagination: {
        page, limit, total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  static async updateRole(id, role) {
    await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    return this.getById(id);
  }

  static async getAll({ page = 1, limit = 50, search }) {
    const offset = (page - 1) * limit;
    const wheres = [];
    const params = [];

    if (search) {
      wheres.push('(username LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';

    const users = await db.query(`
      SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const countResult = await db.queryOne(`SELECT COUNT(*) as total FROM users ${where}`, params);

    return {
      data: users,
      pagination: { page, limit, total: countResult.total, totalPages: Math.ceil(countResult.total / limit) }
    };
  }

  static async searchByUsername(query, limit = 10) {
    return db.query(`
      SELECT id, username, avatar_url
      FROM users
      WHERE username LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [`%${query}%`, limit]);
  }
}

module.exports = UserService;
```

- [ ] **Step 2: Commit**

```bash
git add src/services/user.service.js
git commit -m "refactor: migrate UserService to async MySQL"
```

---

### Task 10-20: Migrate Remaining Services (Pattern Repetition)

Each service follows the same pattern:
1. Change `db.prepare(sql).get(params)` → `await db.queryOne(sql, [params])`
2. Change `db.prepare(sql).all(params)` → `await db.query(sql, [params])`
3. Change `db.prepare(sql).run(params)` → `await db.execute(sql, [params])`
4. Add `async` to all methods

**Services to migrate:**
- Task 10: `src/services/post.service.js`
- Task 11: `src/services/reply.service.js`
- Task 12: `src/services/category.service.js`
- Task 13: `src/services/tag.service.js`
- Task 14: `src/services/bookmark.service.js`
- Task 15: `src/services/notification.service.js` (add Redis caching)
- Task 16: `src/services/message.service.js`
- Task 17: `src/services/attachment.service.js`
- Task 18: `src/services/resource.service.js`
- Task 19: `src/services/log.service.js`
- Task 20: `src/services/ban.service.js`
- Task 21: `src/services/setting.service.js`
- Task 22: `src/services/stat.service.js`

Each task:
- [ ] Step 1: Convert methods to async
- [ ] Step 2: Update controllers that call these services (make routes async)
- [ ] Step 3: Run tests if available
- [ ] Step 4: Commit with message pattern: `refactor: migrate XService to async MySQL`

---

### Task 15 Detail: NotificationService with Redis Cache

**Files:**
- Modify: `src/services/notification.service.js`

- [ ] **Step 1: Add Redis caching for unread counts**

```javascript
const db = require('../database');
const redis = require('../database/redis');

class NotificationService {
  // Cache unread count in Redis for 5 minutes
  static async getUnreadCount(userId) {
    const cacheKey = `unread:${userId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached !== null) {
      return parseInt(cached, 10);
    }
    
    const result = await db.queryOne(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    
    await redis.set(cacheKey, result.count.toString(), 300); // 5 min TTL
    return result.count;
  }

  static async markAsRead(id, userId) {
    await db.execute(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    // Invalidate cache
    await redis.del(`unread:${userId}`);
  }

  static async markAllAsRead(userId) {
    await db.execute(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    // Invalidate cache
    await redis.del(`unread:${userId}`);
  }

  // ... other methods converted to async
}

module.exports = NotificationService;
```

- [ ] **Step 2: Commit**

```bash
git add src/services/notification.service.js
git commit -m "refactor: migrate NotificationService to async with Redis cache"
```

---

### Task 23: Update All Controllers to Async

**Files:**
- Modify: `src/controllers/*.js` (all controller files)

Controllers using these services must be updated to handle async:
- Change `const result = Service.method()` → `const result = await Service.method()`
- Ensure route handlers are async functions

Pattern:
```javascript
// Before (sync)
router.get('/users/:id', (ctx) => {
  const user = UserService.getById(ctx.params.id);
  ctx.body = { success: true, data: user };
});

// After (async)
router.get('/users/:id', async (ctx) => {
  const user = await UserService.getById(ctx.params.id);
  ctx.body = { success: true, data: user };
});
```

- [ ] Step 1: Update each controller file
- [ ] Step 2: Commit all controller changes together

```bash
git add src/controllers/*.js
git commit -m "refactor: migrate all controllers to async for MySQL"
```

---

## Phase 3: Data Migration

### Task 24: Create Data Migration Script

**Files:**
- Create: `src/database/migrate.js`

- [ ] **Step 1: Write SQLite → MySQL migration script**

```javascript
const sqlite3 = require('better-sqlite3');
const path = require('path');
const mysql = require('./mysql');
const config = require('../config');

async function migrateData() {
  // Open SQLite database
  const sqlitePath = process.env.SOURCE_DB || config.database?.path || './data/forum.db';
  const sqlite = new sqlite3(sqlitePath);
  
  console.log(`Migrating from SQLite: ${sqlitePath}`);
  console.log('To MySQL: ', config.mysql.database);
  
  // Tables to migrate in order (respecting foreign keys)
  const tables = [
    'users',
    'categories',
    'tags',
    'posts',
    'replies',
    'post_tags',
    'bookmarks',
    'notifications',
    'messages',
    'attachments',
    'resource_categories',
    'resources',
    'resource_versions',
    'operation_logs',
    'settings',
    'bans'
  ];
  
  for (const table of tables) {
    console.log(`Migrating table: ${table}`);
    
    try {
      // Get all rows from SQLite
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      
      if (rows.length === 0) {
        console.log(`  Table ${table} is empty, skipping`);
        continue;
      }
      
      // Get column names
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const columnList = columns.join(', ');
      
      // Insert into MySQL
      for (const row of rows) {
        const values = columns.map(col => row[col]);
        await mysql.execute(
          `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`,
          values
        );
      }
      
      console.log(`  Migrated ${rows.length} rows`);
    } catch (error) {
      console.error(`  Error migrating ${table}:`, error.message);
    }
  }
  
  // Sessions go to Redis, not MySQL (skip)
  console.log('Sessions will be handled by Redis on new login');
  
  sqlite.close();
  console.log('Migration complete');
}

// Run if called directly
if (require.main === module) {
  migrateData().catch(console.error);
}

module.exports = migrateData;
```

- [ ] **Step 2: Run migration (after MySQL initialized)**

Run: `cd G:\MindProject\MindFourm && node src/database/migrate.js`
Expected: All data migrated from SQLite to MySQL

- [ ] **Step 3: Verify migration**

Run: `F:\MySQL\bin\mysql.exe -u root -p mindforum -e "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM posts;"`

- [ ] **Step 4: Commit**

```bash
git add src/database/migrate.js
git commit -m "feat: add SQLite to MySQL data migration script"
```

---

## Phase 4: Rate Limiting with Redis

### Task 25: Update Rate Limit Middleware

**Files:**
- Modify: `src/middleware/rate-limit.js` (if exists)
- Create if not: `src/middleware/rate-limit.js`

- [ ] **Step 1: Implement Redis-based rate limiting**

```javascript
const redis = require('../database/redis');

function rateLimit(options = {}) {
  const {
    windowMs = 60000,    // 1 minute window
    max = 100,           // max requests per window
    keyGenerator = (ctx) => ctx.ip || ctx.headers['x-forwarded-for'] || 'unknown'
  } = options;

  return async (ctx, next) => {
    const key = `ratelimit:${keyGenerator(ctx)}`;
    
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, Math.floor(windowMs / 1000));
    }
    
    const ttl = await redis.ttl(key);
    
    ctx.set('X-RateLimit-Limit', max.toString());
    ctx.set('X-RateLimit-Remaining', Math.max(0, max - current).toString());
    ctx.set('X-RateLimit-Reset', ttl.toString());
    
    if (current > max) {
      ctx.status = 429;
      ctx.body = {
        success: false,
        message: 'Too many requests, please try again later',
        retryAfter: ttl
      };
      return;
    }
    
    return next();
  };
}

module.exports = { rateLimit };
```

- [ ] **Step 2: Apply rate limit to routes**

Modify: `src/routes/index.js` or appropriate route file

```javascript
const { rateLimit } = require('../middleware/rate-limit');

// Apply to API routes
router.use('/api', rateLimit({ windowMs: 60000, max: 100 }));

// Stricter limit for auth routes
router.use('/api/auth', rateLimit({ windowMs: 60000, max: 10 }));
```

- [ ] **Step 3: Commit**

```bash
git add src/middleware/rate-limit.js src/routes/index.js
git commit -m "feat: implement Redis-based rate limiting"
```

---

## Phase 5: Testing and Verification

### Task 26: Add Integration Tests

**Files:**
- Create: `tests/integration/mysql.test.js`

- [ ] **Step 1: Write MySQL integration tests**

```javascript
const assert = require('assert');
const db = require('../../src/database');

describe('MySQL Integration', function() {
  this.timeout(30000);

  before(async function() {
    await db.initialize();
  });

  after(async function() {
    await db.close();
  });

  describe('UserService', function() {
    it('should create and retrieve user', async function() {
      const UserService = require('../../src/services/user.service');
      
      // This test depends on existing data or creates test data
      const users = await UserService.getAll({ page: 1, limit: 10 });
      assert.ok(users.data);
      assert.ok(users.pagination);
    });
  });

  describe('AuthService', function() {
    it('should create session in Redis', async function() {
      const AuthService = require('../../src/services/auth.service');
      const redis = require('../../src/database/redis');
      
      const token = await AuthService.createSession(1);
      assert.ok(token);
      
      const session = await redis.hgetall(`session:${token}`);
      assert.ok(session.user_id);
      
      await AuthService.destroySession(token);
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: Configure test runner and verify tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/integration/mysql.test.js
git commit -m "test: add MySQL integration tests"
```

---

### Task 27: Manual Verification

- [ ] **Step 1: Start the application**

Run: `cd G:\MindProject\MindFourm && npm run dev`

- [ ] **Step 2: Test login flow**
- Navigate to frontend
- Login via MindAuth
- Verify session stored in Redis: `redis-cli HGETALL session:<token>`
- Verify user data in MySQL

- [ ] **Step 3: Test CRUD operations**
- Create a post
- Add reply
- Verify data persisted to MySQL

- [ ] **Step 4: Test rate limiting**
- Make rapid requests
- Verify 429 response after limit exceeded

---

## Summary and Rollback Plan

### Final Commit

```bash
git add -A
git commit -m "feat: complete SQLite to MySQL + Redis migration"
git tag v2.0.0-mysql-redis
```

### Rollback Instructions

If issues arise:
1. Restore `package.json` to include `better-sqlite3`
2. Restore `src/database/index.js` from git history
3. Restore service files from git history
4. Restart application with SQLite

```bash
git checkout v1.0.0 -- package.json src/database src/services
npm install
npm run dev
```

---

## Spec Coverage Checklist

| Requirement | Task |
|-------------|------|
| MySQL connection (F:\MySQL\bin) | Task 3, Task 5 |
| Redis connection | Task 4 |
| Session storage in Redis | Task 8 |
| All services async | Tasks 8-22 |
| Controllers async | Task 23 |
| Rate limiting Redis | Task 25 |
| Data migration script | Task 24 |
| Tests | Task 26 |
| Manual verification | Task 27 |

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-23-mysql-redis-migration.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach would you prefer?**