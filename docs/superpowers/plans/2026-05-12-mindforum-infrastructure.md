# MindForum 基础设施加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加固数据库事务、索引、API 路由版本化、前端错误处理与 SEO。

**Architecture:** 分三层依次推进：后端数据库 → 后端 API → 前端。每层独立可验证。

**Tech Stack:** Koa, better-sqlite3, Next.js 14, TypeScript, TailwindCSS

---

## File Map

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/database/schema.sql` | 修改 | CASCADE + 新索引 |
| `src/database/index.js` | 修改 | 迁移版本号 |
| `src/services/post.service.js` | 修改 | 事务包裹 |
| `src/services/reply.service.js` | 修改 | 事务包裹 |
| `src/services/log.service.js` | 修改 | 自动清理 |
| `src/utils/response.js` | 修改 | 加 `error` 方法 |
| `src/middleware/permission.js` | 修改 | 统一响应 |
| `src/middleware/validate.js` | 修改 | 增强规则 |
| `src/middleware/error.js` | 修改 | 加 `code` 字段 |
| `src/routes/index.js` | 修改 | v1 路由 |
| `src/routes/*.routes.js` | 修改 | 各路由 v1 注册 |
| `src/controllers/post.controller.js` | 修改 | 统一响应 + 修复 replies |
| `src/controllers/reply.controller.js` | 修改 | 统一响应 |
| `src/controllers/admin.controller.js` | 修改 | 统一响应 |
| `src/controllers/category.controller.js` | 修改 | 统一响应 |
| `src/controllers/tag.controller.js` | 修改 | 统一响应 |
| `frontend/src/app/error.tsx` | 新建 | 全局错误边界 |
| `frontend/src/app/not-found.tsx` | 新建 | 404 页面 |
| `frontend/src/app/loading.tsx` | 新建 | 全局 loading |
| `frontend/src/components/forum/post-skeleton.tsx` | 新建 | 列表骨架 |
| `frontend/src/components/forum/post-detail-skeleton.tsx` | 新建 | 详情骨架 |
| `frontend/src/app/(public)/page.tsx` | 修改 | ISR |
| `frontend/src/app/(public)/posts/[id]/page.tsx` | 修改 | ISR + metadata + replies |
| `frontend/src/app/(public)/categories/[id]/page.tsx` | 修改 | ISR + metadata |
| `frontend/src/app/(public)/users/[id]/page.tsx` | 修改 | 错误处理 |
| `frontend/src/app/(public)/tags/[slug]/page.tsx` | 修改 | 错误处理 |
| `frontend/src/app/(auth)/login/page.tsx` | 修改 | 错误处理 |
| `frontend/src/app/(auth)/callback/page.tsx` | 修改 | 错误处理 |
| `frontend/src/lib/api/client.ts` | 修改 | 版本号头 |

---

### Task 1: 数据库 Schema 重写

**Files:**
- Modify: `src/database/schema.sql`
- Modify: `src/database/index.js`

- [ ] **Step 1.1: 重写 schema.sql**

用以下完整内容替换 `src/database/schema.sql`：

```sql
-- users
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mindauth_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- categories
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- posts
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    is_pinned INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- replies
CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_reply_id INTEGER,
    content TEXT NOT NULL,
    content_html TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_reply_id) REFERENCES replies(id) ON DELETE CASCADE
);

-- tags
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- post_tags
CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- sessions
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    mindauth_token TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- operation_logs
CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_category_id ON posts(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_posts_pinned_created ON posts(is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_replies_post_id ON replies(post_id);
CREATE INDEX IF NOT EXISTS idx_replies_user_id ON replies(user_id);
CREATE INDEX IF NOT EXISTS idx_replies_parent_id ON replies(parent_reply_id);
CREATE INDEX IF NOT EXISTS idx_replies_status ON replies(status);
CREATE INDEX IF NOT EXISTS idx_replies_post_created ON replies(post_id, created_at);

CREATE INDEX IF NOT EXISTS idx_users_mindauth_id ON users(mindauth_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_logs_user_id ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_action ON operation_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_target ON operation_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON operation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_action ON operation_logs(user_id, action);
```

- [ ] **Step 1.2: 重写 database/index.js**

用以下内容替换 `src/database/index.js` 全部内容：

```javascript
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;

const CURRENT_DB_VERSION = 2;

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
  } catch (e) { /* already exists */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  } catch (e) { /* already exists */ }

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
```

关键变化：加了 `foreign_keys = ON`（之前没开，CASCADE 不会生效）。

- [ ] **Step 1.3: 验证**

```bash
# 删除旧数据库重建
rm -f data/forum.db data/forum.db-shm data/forum.db-wal
node -e "require('./src/database').initialize();"
sqlite3 data/forum.db ".schema"
```

确认输出包含 `ON DELETE CASCADE` 和新索引。

---

### Task 2: 数据库事务 + 日志清理

**Files:**
- Modify: `src/services/post.service.js`
- Modify: `src/services/reply.service.js`
- Modify: `src/services/log.service.js`

- [ ] **Step 2.1: 读取并替换 post.service.js**

用以下内容完整替换 `src/services/post.service.js`：

```javascript
const db = require('../database');
const { parseMarkdown } = require('../utils/markdown');
const { POST_STATUS } = require('../utils/constants');
const TagService = require('./tag.service');

class PostService {
  static create({ user_id, title, content, category_id, tags, status = POST_STATUS.draft }) {
    const contentHtml = parseMarkdown(content);

    const insertPost = db.prepare(`
      INSERT INTO posts (user_id, title, content, content_html, category_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = db.transaction(() => {
      const r = insertPost.run(user_id, title, content, contentHtml, category_id, status);
      const postId = r.lastInsertRowid;

      if (tags && tags.length > 0) {
        TagService.attachTags(postId, tags);
      }

      return postId;
    })();

    return this.getById(result);
  }

  static getById(id) {
    const post = db.prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug,
             u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `).get(id);

    if (post) {
      post.tags = TagService.getPostTags(post.id);
    }

    return post;
  }

  static getList({ page = 1, limit = 20, category_id, status = POST_STATUS.published, user_id }) {
    const offset = (page - 1) * limit;
    const whereClauses = ['p.deleted_at IS NULL'];
    const params = [];

    if (category_id) {
      whereClauses.push('p.category_id = ?');
      params.push(category_id);
    }

    if (status) {
      whereClauses.push('p.status = ?');
      params.push(status);
    }

    if (user_id) {
      whereClauses.push('p.user_id = ?');
      params.push(user_id);
    }

    const whereClause = whereClauses.join(' AND ');

    const posts = db.prepare(`
      SELECT p.*, c.name as category_name,
             u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE ${whereClause}
      ORDER BY p.is_pinned DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const countResult = db.prepare(`SELECT COUNT(*) as total FROM posts p WHERE ${whereClause}`).get(...params);

    return {
      data: posts,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  static update(id, updates) {
    const fields = [];
    const values = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      fields.push('content_html = ?');
      values.push(updates.content);
      values.push(parseMarkdown(updates.content));
    }
    if (updates.category_id !== undefined) {
      fields.push('category_id = ?');
      values.push(updates.category_id);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.is_pinned !== undefined) {
      fields.push('is_pinned = ?');
      values.push(updates.is_pinned ? 1 : 0);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.transaction(() => {
      db.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      if (updates.tags !== undefined) {
        TagService.detachTags(id);
        if (updates.tags.length > 0) {
          TagService.attachTags(id, updates.tags);
        }
      }
    })();

    return this.getById(id);
  }

  static softDelete(id) {
    db.prepare(`
      UPDATE posts SET status = ?, deleted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(POST_STATUS.deleted, id);
  }

  static incrementViewCount(id) {
    db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(id);
  }

  static pin(id, isPinned) {
    db.prepare('UPDATE posts SET is_pinned = ? WHERE id = ?').run(isPinned ? 1 : 0, id);
    return this.getById(id);
  }

  static move(id, categoryId) {
    db.prepare('UPDATE posts SET category_id = ? WHERE id = ?').run(categoryId, id);
    return this.getById(id);
  }
}

module.exports = PostService;
```

- [ ] **Step 2.2: 读取并替换 reply.service.js**

用以下内容完整替换 `src/services/reply.service.js`：

```javascript
const db = require('../database');
const { parseMarkdown } = require('../utils/markdown');
const { REPLY_STATUS } = require('../utils/constants');

class ReplyService {
  static create({ post_id, user_id, content, parent_reply_id = null }) {
    let finalContent = content;

    if (parent_reply_id) {
      const parentReply = this.getById(parent_reply_id);
      if (parentReply && parentReply.post_id === post_id) {
        finalContent = `> ${parentReply.content.split('\n')[0]}\n\n${content}`;
      }
    }

    const contentHtml = parseMarkdown(finalContent);

    const insertReply = db.prepare(`
      INSERT INTO replies (post_id, user_id, parent_reply_id, content, content_html)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = db.transaction(() => {
      return insertReply.run(post_id, user_id, parent_reply_id, finalContent, contentHtml).lastInsertRowid;
    })();

    return this.getById(result);
  }

  static getById(id) {
    return db.prepare(`
      SELECT r.*, u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM replies r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.id = ? AND r.deleted_at IS NULL
    `).get(id);
  }

  static getByPostId(postId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;

    const replies = db.prepare(`
      SELECT r.*, u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM replies r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.post_id = ? AND r.deleted_at IS NULL
      ORDER BY r.created_at ASC
      LIMIT ? OFFSET ?
    `).all(postId, limit, offset);

    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM replies
      WHERE post_id = ? AND deleted_at IS NULL
    `).get(postId);

    return {
      data: replies,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  static update(id, content) {
    const contentHtml = parseMarkdown(content);
    db.prepare(`
      UPDATE replies SET content = ?, content_html = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(content, contentHtml, id);

    return this.getById(id);
  }

  static softDelete(id) {
    db.prepare(`
      UPDATE replies SET status = ?, deleted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(REPLY_STATUS.deleted, id);
  }
}

module.exports = ReplyService;
```

- [ ] **Step 2.3: 读取 log.service.js 并添加自动清理**

先读取当前文件，然后在 `log` 方法末尾（`return` 前）添加：

```javascript
// Auto-cleanup: keep at most 10000 rows
const count = db.prepare('SELECT COUNT(*) as cnt FROM operation_logs').get();
if (count.cnt > 10000) {
  db.prepare('DELETE FROM operation_logs WHERE id IN (SELECT id FROM operation_logs ORDER BY created_at ASC LIMIT 5000)').run();
}
```

---

### Task 3: 统一响应格式 + 验证 + 错误

**Files:**
- Modify: `src/utils/response.js`
- Modify: `src/middleware/permission.js`
- Modify: `src/middleware/validate.js`
- Modify: `src/middleware/error.js`

- [ ] **Step 3.1: 增强 Response 工具**

读取 `src/utils/response.js`，确认有 `error` 方法。如果没有，添加：

```javascript
static error(ctx, message, statusCode = 400, code = null) {
  ctx.status = statusCode;
  ctx.body = { success: false, message, code };
}
```

- [ ] **Step 3.2: permission.js 统一响应**

读取 `src/middleware/permission.js`，将所有直接 `ctx.body = { ... }` 改为使用 `Response.error`：

```javascript
const Response = require('../utils/response');

// 在 requirePermission 中：
if (!user) {
  return Response.error(ctx, 'Authentication required', 401, 'UNAUTHENTICATED');
}
// ... 其他权限不足处同理
```

- [ ] **Step 3.3: validate.js 增强规则**

读取 `src/middleware/validate.js` 当前内容，添加以下验证工厂函数：

```javascript
function validatePost() {
  return (ctx, next) => {
    const { title, content, tags } = ctx.request.body;
    const errors = [];

    if (!title || title.trim().length < 1 || title.trim().length > 200) {
      errors.push({ field: 'title', message: 'Title must be 1-200 characters' });
    }
    if (!content || content.trim().length < 10) {
      errors.push({ field: 'content', message: 'Content must be at least 10 characters' });
    }
    if (tags && (!Array.isArray(tags) || tags.length > 5 || tags.some(t => !t || t.length > 30))) {
      errors.push({ field: 'tags', message: 'Tags must be an array of up to 5 items, each 1-30 characters' });
    }

    if (errors.length > 0) {
      const Response = require('../utils/response');
      return Response.error(ctx, 'Validation failed', 422, 'VALIDATION_ERROR');
    }

    return next();
  };
}

function validateReply() {
  return (ctx, next) => {
    const { content } = ctx.request.body;
    const errors = [];

    if (!content || content.trim().length < 1) {
      errors.push({ field: 'content', message: 'Content is required' });
    }

    if (errors.length > 0) {
      const Response = require('../utils/response');
      return Response.error(ctx, 'Validation failed', 422, 'VALIDATION_ERROR');
    }

    return next();
  };
}

function validateCategory() {
  return (ctx, next) => {
    const { name, slug } = ctx.request.body;
    const errors = [];

    if (!name || name.trim().length < 1) {
      errors.push({ field: 'name', message: 'Name is required' });
    }
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      errors.push({ field: 'slug', message: 'Slug must be lowercase letters, numbers, and hyphens only' });
    }

    if (errors.length > 0) {
      const Response = require('../utils/response');
      return Response.error(ctx, 'Validation failed', 422, 'VALIDATION_ERROR');
    }

    return next();
  };
}

module.exports = { validatePost, validateReply, validateCategory };
```

- [ ] **Step 3.4: error.js 加 code 字段**

读取 `src/middleware/error.js`，在错误响应 body 中加入 `code` 字段（如果 error 对象有的话）。

---

### Task 4: API 路由版本化

**Files:**
- Modify: `src/routes/index.js`
- Modify: 各路由文件（post.routes.js, reply.routes.js, category.routes.js, tag.routes.js, admin.routes.js, auth.routes.js）

- [ ] **Step 4.1: routes/index.js 添加 v1 路由**

用以下内容替换 `src/routes/index.js`：

```javascript
const Router = require('@koa/router');
const authRoutes = require('./auth.routes');
const postRoutes = require('./post.routes');
const { router: replyRoutes, replyRouter } = require('./reply.routes');
const categoryRoutes = require('./category.routes');
const tagRoutes = require('./tag.routes');
const adminRoutes = require('./admin.routes');

const router = new Router();
const v1Router = new Router({ prefix: '/api/v1' });

// Legacy routes (prefix: /api)
router.use(authRoutes.routes());
router.use(postRoutes.routes());
router.use(replyRoutes.routes());
router.use(replyRouter.routes());
router.use(categoryRoutes.routes());
router.use(tagRoutes.routes());
router.use(adminRoutes.routes());

// v1 routes (prefix: /api/v1)
v1Router.use(authRoutes.routes());
v1Router.use(postRoutes.routes());
v1Router.use(replyRoutes.routes());
v1Router.use(replyRouter.routes());
v1Router.use(categoryRoutes.routes());
v1Router.use(tagRoutes.routes());
v1Router.use(adminRoutes.routes());

// API version header middleware
router.use(async (ctx, next) => {
  ctx.set('X-API-Version', 'legacy');
  return next();
});

v1Router.use(async (ctx, next) => {
  ctx.set('X-API-Version', '1');
  return next();
});

router.use(v1Router.routes());
router.use(v1Router.allowedMethods());

module.exports = router;
```

---

### Task 5: Controller 统一响应 + 修复 replies bug

**Files:**
- Modify: `src/controllers/post.controller.js`
- Modify: `src/controllers/reply.controller.js`
- Modify: `src/controllers/admin.controller.js`
- Modify: `src/controllers/category.controller.js`
- Modify: `src/controllers/tag.controller.js`

- [ ] **Step 5.1: post.controller.js 统一响应 + 修复 replies**

读取 `src/controllers/post.controller.js`，做以下修改：

1. 所有 `ctx.status = XXX; ctx.body = { ... }` 改为 `Response.xxx(ctx, ...)`
2. `getById` 方法中，将 `const replies = PostService.getReplies ? [] : [];` 替换为：

```javascript
const { page: repliesPage, limit: repliesLimit } = ctx.query;
const repliesResult = ReplyService.getByPostId(parseInt(id), {
  page: parseInt(repliesPage) || 1,
  limit: parseInt(repliesLimit) || 20
});
```

3. 文件顶部添加 `const ReplyService = require('../services/reply.service');`

- [ ] **Step 5.2: 其他 controller 统一响应**

对 `reply.controller.js`、`admin.controller.js`、`category.controller.js`、`tag.controller.js`，将所有直接 `ctx.body` 赋值改为 `Response` 方法调用。

---

### Task 6: 前端错误边界 + Loading

**Files:**
- Create: `frontend/src/app/error.tsx`
- Create: `frontend/src/app/not-found.tsx`
- Create: `frontend/src/app/loading.tsx`
- Create: `frontend/src/components/forum/post-skeleton.tsx`
- Create: `frontend/src/components/forum/post-detail-skeleton.tsx`

- [ ] **Step 6.1: 创建 error.tsx**

```tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-gray-600 mb-4">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.2: 创建 not-found.tsx**

```tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Page not found</h2>
        <p className="text-gray-600 mb-4">The page you're looking for doesn't exist.</p>
        <Link href="/" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Back to home
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.3: 创建 loading.tsx**

```tsx
export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 animate-pulse">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="h-8 bg-gray-200 rounded w-48 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white rounded-lg p-4">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.4: 创建 post-skeleton.tsx**

```tsx
export function PostSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-5 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="flex gap-2">
        <div className="h-5 bg-gray-200 rounded-full w-16" />
        <div className="h-5 bg-gray-200 rounded-full w-16" />
      </div>
    </div>
  );
}
```

- [ ] **Step 6.5: 创建 post-detail-skeleton.tsx**

```tsx
export function PostDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 bg-gray-200 rounded w-2/3" />
      <div className="flex gap-4 text-sm text-gray-400">
        <div className="h-4 bg-gray-200 rounded w-24" />
        <div className="h-4 bg-gray-200 rounded w-16" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-5/6" />
        <div className="h-4 bg-gray-200 rounded w-4/6" />
      </div>
      <div className="border-t pt-4">
        <div className="h-6 bg-gray-200 rounded w-24 mb-3" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-gray-100 rounded p-3">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

### Task 7: 前端 ISR + Metadata + Replies 显示

**Files:**
- Modify: `frontend/src/app/(public)/page.tsx`
- Modify: `frontend/src/app/(public)/posts/[id]/page.tsx`
- Modify: `frontend/src/app/(public)/categories/[id]/page.tsx`
- Modify: `frontend/src/app/(public)/users/[id]/page.tsx`
- Modify: `frontend/src/app/(public)/tags/[slug]/page.tsx`
- Modify: `frontend/src/app/(auth)/login/page.tsx`
- Modify: `frontend/src/app/(auth)/callback/page.tsx`
- Modify: `frontend/src/lib/api/client.ts`

- [ ] **Step 7.1: 修改 api/client.ts**

读取 `frontend/src/lib/api/client.ts`，在 request 函数的 headers 中加入：

```typescript
headers: {
  'Content-Type': 'application/json',
  'X-API-Version': '1',
  ...options.headers,
},
```

- [ ] **Step 7.2: 首页 ISR**

读取 `frontend/src/app/(public)/page.tsx`，添加：

```tsx
export const revalidate = 30;
```

在 fetch 调用中添加：

```typescript
const res = await fetch(`${API_BASE}/api/v1/posts${qs}`, {
  next: { tags: ['posts'] },
  credentials: 'include',
});
```

- [ ] **Step 7.3: 帖子详情 ISR + metadata + replies**

读取 `frontend/src/app/(public)/posts/[id]/page.tsx`，添加：

```tsx
import { Metadata } from 'next';
import { PostDetailSkeleton } from '@/components/forum/post-detail-skeleton';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  // fetch post, return { title: `${post.title} - MindForum` }
}
```

将回复显示从空改为实际调用 reply API。

- [ ] **Step 7.4: 分类页 ISR + metadata**

读取 `frontend/src/app/(public)/categories/[id]/page.tsx`，添加 `export const revalidate = 300;` 和 `generateMetadata`。

- [ ] **Step 7.5: 其余页面加错误处理**

对 `users/[id]/page.tsx`、`tags/[slug]/page.tsx`、`login/page.tsx`、`callback/page.tsx`，在 API 调用处加 try/catch，失败时调用 `notFound()`。

---

### Task 8: 验证

- [ ] **Step 8.1: 启动验证**

```bash
# Backend
npm run dev

# Frontend (new terminal)
cd frontend && npm run dev
```

- [ ] **Step 8.2: 验证清单**

- [ ] 访问 http://localhost:3000，确认帖子列表加载
- [ ] 访问帖子详情，确认回复正确显示（不是空）
- [ ] 浏览器 DevTools Network 确认 `X-API-Version: 1` 响应头
- [ ] 访问不存在 URL 确认 404 页面
- [ ] 数据库验证：`sqlite3 data/forum.db "PRAGMA foreign_keys;"` 返回 1
- [ ] `sqlite3 data/forum.db ".schema"` 确认 CASCADE 和新索引

---
