# MindForum 管理面板重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将管理面板从 4 个页面扩展为 14+ 页面的完整后台，支持站点设置、内容管理、系统配置和仪表盘统计，配置数据存入 SQLite

**Architecture:** 新增 settings 表（key-value）和 bans 表存储配置，后端新增服务层和中间件，前端新增 10+ 页面全部客户端渲染

**Tech Stack:** Next.js 14 (frontend), Koa + better-sqlite3 (backend), Tailwind CSS

---

## 文件结构总览

### 新建文件
| 文件 | 职责 |
|------|------|
| `src/services/setting.service.js` | Settings CRUD by category |
| `src/services/stat.service.js` | Dashboard statistics aggregation |
| `src/services/ban.service.js` | Ban CRUD + IP/user lookup |
| `src/middleware/rate-limit.js` | In-memory rate limiting middleware |
| `src/middleware/ban-check.js` | Ban check middleware |
| `frontend/src/lib/api/admin-new.ts` | 新增 admin API 客户端函数 |
| `frontend/src/app/admin/settings/layout.tsx` | Settings 子布局 + 子导航 |
| `frontend/src/app/admin/settings/basic/page.tsx` | 站点基本信息设置 |
| `frontend/src/app/admin/settings/announce/page.tsx` | 公告管理 |
| `frontend/src/app/admin/settings/display/page.tsx` | 显示设置 |
| `frontend/src/app/admin/settings/seo/page.tsx` | SEO 设置 |
| `frontend/src/app/admin/content/tags/page.tsx` | 标签管理 |
| `frontend/src/app/admin/content/moderation/page.tsx` | 审核队列 |
| `frontend/src/app/admin/system/rules/page.tsx` | 发帖规则设置 |
| `frontend/src/app/admin/system/rate-limits/page.tsx` | 限流设置 |
| `frontend/src/app/admin/system/bans/page.tsx` | 封禁管理 |
| `frontend/src/app/admin/system/cleanup/page.tsx` | 数据清理 |

### 修改文件
| 文件 | 变更内容 |
|------|----------|
| `src/database/schema.sql` | 新增 settings 表、bans 表、索引 |
| `src/utils/constants.js` | 新增 LOG_ACTIONS |
| `src/controllers/admin.controller.js` | 新增 20+ handler 方法 |
| `src/routes/admin.routes.js` | 新增 20+ 路由 |
| `frontend/src/components/admin/admin-sidebar.tsx` | 新增导航项 |
| `frontend/src/components/admin/dashboard.tsx` | 对接真实 API |
| `frontend/src/app/admin/posts/page.tsx` | 增加批量操作 |
| `frontend/src/app/admin/users/page.tsx` | 搜索功能 |
| `frontend/src/types/index.ts` | 新增类型定义 |
| `frontend/src/lib/api/client.ts` | 补充 adminApi |

---

## Task 1: 数据库 schema 更新

**Files:**
- Modify: `src/database/schema.sql`

- [ ] **Step 1: 在 schema.sql 末尾添加 settings 表、bans 表及索引**

在 `src/database/schema.sql` 文件末尾追加（在最后一个 CREATE INDEX 之后）：

```sql
-- settings (key-value store for admin configuration)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);

-- bans (IP/user blocking)
CREATE TABLE IF NOT EXISTS bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ban_type TEXT NOT NULL,
    value TEXT NOT NULL,
    reason TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bans_type ON bans(ban_type);
CREATE INDEX IF NOT EXISTS idx_bans_active ON bans(is_active);
CREATE INDEX IF NOT EXISTS idx_bans_value ON bans(value);
```

- [ ] **Step 2: 验证新表创建成功**

```bash
node -e "const db = require('./src/database'); db.initialize(); console.log('Tables:', db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(r=>r.name).join(', ')); db.close()"
```

Expected: output includes `settings` and `bans`

- [ ] **Step 3: Commit**

```bash
git add src/database/schema.sql
git commit -m "feat(db): add settings and bans tables for admin panel"
```

---

## Task 2: SettingService

**Files:**
- Create: `src/services/setting.service.js`

- [ ] **Step 1: 创建 setting.service.js**

```javascript
const db = require('../database');

const DEFAULT_SETTINGS = {
  // Basic
  site_name: 'MindForum',
  site_tagline: 'Share ideas, exchange experience',
  site_description: 'A community for technical discussion and knowledge sharing.',
  site_logo_url: '',
  site_footer: '© 2026 MindForum',
  // Announce
  announce_enabled: 'true',
  announce_content: '',
  // Display
  posts_per_page: '20',
  default_sort: 'newest',
  replies_per_page: '50',
  // SEO
  seo_title_suffix: ' | MindForum',
  seo_default_description: 'MindForum - A community for technical discussion',
  seo_og_image: '',
  seo_sitemap_enabled: 'true',
  seo_robots_enabled: 'true',
  // Rules
  title_min_length: '2',
  title_max_length: '200',
  content_min_length: '10',
  max_tags_per_post: '5',
  max_tag_length: '30',
  // Rate limits
  rate_post_max: '10',
  rate_post_window_min: '60',
  rate_reply_max: '30',
  rate_reply_window_min: '60',
  rate_reply_newuser_cooldown_sec: '300',
  rate_login_max: '5',
  rate_login_lock_min: '15',
  rate_api_max: '100',
  // Cleanup
  cleanup_log_retention_days: '90',
  cleanup_soft_delete_retention_days: '30',
  cleanup_session_ttl_hours: '24'
};

const CATEGORY_KEYS = {
  basic: ['site_name', 'site_tagline', 'site_description', 'site_logo_url', 'site_footer'],
  announce: ['announce_enabled', 'announce_content'],
  display: ['posts_per_page', 'default_sort', 'replies_per_page'],
  seo: ['seo_title_suffix', 'seo_default_description', 'seo_og_image', 'seo_sitemap_enabled', 'seo_robots_enabled'],
  rules: ['title_min_length', 'title_max_length', 'content_min_length', 'max_tags_per_post', 'max_tag_length'],
  rate_limit: ['rate_post_max', 'rate_post_window_min', 'rate_reply_max', 'rate_reply_window_min', 'rate_reply_newuser_cooldown_sec', 'rate_login_max', 'rate_login_lock_min', 'rate_api_max'],
  cleanup: ['cleanup_log_retention_days', 'cleanup_soft_delete_retention_days', 'cleanup_session_ttl_hours']
};

class SettingService {
  static seedDefaults() {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, category, description) VALUES (?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const [category, keys] of Object.entries(CATEGORY_KEYS)) {
        for (const key of keys) {
          stmt.run(key, DEFAULT_SETTINGS[key], category, null);
        }
      }
    })();
  }

  static getByCategory(category) {
    const keys = CATEGORY_KEYS[category];
    if (!keys) return {};

    const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (' + keys.map(() => '?').join(',') + ')').all(...keys);

    const result = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }

    for (const key of keys) {
      if (!(key in result)) {
        result[key] = DEFAULT_SETTINGS[key];
      }
    }

    return result;
  }

  static getAll() {
    const rows = db.prepare('SELECT key, value, category FROM settings ORDER BY category, key').all();
    const result = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(key in result)) {
        result[key] = value;
      }
    }

    return result;
  }

  static setBatch(category, keyValuePairs) {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, category, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    db.transaction(() => {
      for (const [key, value] of Object.entries(keyValuePairs)) {
        stmt.run(key, String(value), category);
      }
    })();

    return this.getByCategory(category);
  }

  static get(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (row) return row.value;
    return DEFAULT_SETTINGS[key] ?? null;
  }

  static getNumber(key) {
    const val = this.get(key);
    if (val === null) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  }
}

module.exports = SettingService;
```

- [ ] **Step 2: 验证**

```bash
node -e "
const db = require('./src/database');
db.initialize();
const S = require('./src/services/setting.service');
S.seedDefaults();
console.log('basic:', Object.keys(S.getByCategory('basic')));
S.setBatch('basic', { site_name: 'TestForum' });
console.log('after update:', S.get('site_name'));
db.close();
"
```

- [ ] **Step 3: Commit**

```bash
git add src/services/setting.service.js
git commit -m "feat(services): add SettingService with seed, get, setBatch"
```

---

## Task 3: StatService 和 BanService

**Files:**
- Create: `src/services/stat.service.js`
- Create: `src/services/ban.service.js`

- [ ] **Step 1: 创建 stat.service.js**

```javascript
const db = require('../database');

class StatService {
  static getDashboardStats() {
    const totals = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) as total_posts,
        (SELECT COUNT(*) FROM replies WHERE deleted_at IS NULL) as total_replies,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 'published' AND date(created_at) = date('now')) as today_posts,
        (SELECT COUNT(*) FROM replies WHERE deleted_at IS NULL AND date(created_at) = date('now')) as today_replies,
        (SELECT COUNT(*) FROM users WHERE date(created_at) = date('now')) as today_users
    `).get();

    const active24h = db.prepare(`
      SELECT COUNT(DISTINCT s.user_id) as count
      FROM sessions s
      WHERE s.expires_at > datetime('now', '-24 hours')
    `).get();

    const activity7d = db.prepare(`
      WITH dates(d) AS (
        SELECT date('now', '-6 days') UNION ALL SELECT date('now', '-5 days') UNION ALL
        SELECT date('now', '-4 days') UNION ALL SELECT date('now', '-3 days') UNION ALL
        SELECT date('now', '-2 days') UNION ALL SELECT date('now', '-1 day') UNION ALL
        SELECT date('now')
      ),
      pc AS (
        SELECT date(created_at) as d, COUNT(*) as cnt
        FROM posts WHERE deleted_at IS NULL AND status = 'published' AND created_at >= date('now', '-6 days')
        GROUP BY date(created_at)
      )
      SELECT dates.d, COALESCE(pc.cnt, 0) as cnt FROM dates LEFT JOIN pc ON dates.d = pc.d ORDER BY dates.d
    `).all();

    return {
      total_posts: totals.total_posts,
      total_replies: totals.total_replies,
      total_users: totals.total_users,
      active_24h: active24h.count,
      today_posts: totals.today_posts,
      today_replies: totals.today_replies,
      today_users: totals.today_users,
      activity_7d: activity7d.map(r => r.cnt)
    };
  }
}

module.exports = StatService;
```

- [ ] **Step 2: 创建 ban.service.js**

```javascript
const db = require('../database');

class BanService {
  static create({ ban_type, value, reason, created_by }) {
    const result = db.prepare(`
      INSERT INTO bans (ban_type, value, reason, created_by)
      VALUES (?, ?, ?, ?)
    `).run(ban_type, value, reason || null, created_by);
    return db.prepare('SELECT * FROM bans WHERE id = ?').get(result.lastInsertRowid);
  }

  static getList({ page = 1, limit = 20, ban_type, is_active }) {
    const offset = (page - 1) * limit;
    const wheres = [];
    const params = [];

    if (ban_type) { wheres.push('ban_type = ?'); params.push(ban_type); }
    if (is_active !== undefined) { wheres.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    const where = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';

    const bans = db.prepare(`
      SELECT b.*, u.username as creator_name
      FROM bans b LEFT JOIN users u ON b.created_by = u.id
      ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = db.prepare(`SELECT COUNT(*) as total FROM bans ${where}`).get(...params).total;

    return { data: bans, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  static getById(id) {
    return db.prepare('SELECT b.*, u.username as creator_name FROM bans b LEFT JOIN users u ON b.created_by = u.id WHERE b.id = ?').get(id);
  }

  static update(id, updates) {
    const fields = [];
    const values = [];
    if (updates.reason !== undefined) { fields.push('reason = ?'); values.push(updates.reason); }
    if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active ? 1 : 0); }
    if (fields.length === 0) return this.getById(id);
    values.push(id);
    db.prepare(`UPDATE bans SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  static deactivate(id) {
    return this.update(id, { is_active: false });
  }

  static isActive(type, value) {
    return db.prepare('SELECT 1 FROM bans WHERE ban_type = ? AND value = ? AND is_active = 1').get(type, value);
  }

  static checkIp(ip) {
    if (this.isActive('ip', ip)) return true;

    const ranges = db.prepare("SELECT value FROM bans WHERE ban_type = 'ip_range' AND is_active = 1").all();
    for (const row of ranges) {
      if (this.ipInRange(ip, row.value)) return true;
    }
    return false;
  }

  static ipInRange(ip, cidr) {
    if (!cidr.includes('/')) return ip === cidr;
    const [base, bits] = cidr.split('/');
    const mask = ~((1 << (32 - parseInt(bits))) - 1);
    const ipNum = this.ipToNum(ip);
    const baseNum = this.ipToNum(base);
    return (ipNum & mask) === (baseNum & mask);
  }

  static ipToNum(ip) {
    return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  }
}

module.exports = BanService;
```

- [ ] **Step 3: Commit**

```bash
git add src/services/stat.service.js src/services/ban.service.js
git commit -m "feat(services): add StatService and BanService"
```

---

## Task 4: 限流中间件和封禁中间件

**Files:**
- Create: `src/middleware/rate-limit.js`
- Create: `src/middleware/ban-check.js`

- [ ] **Step 1: 创建 rate-limit.js**

```javascript
const Response = require('../utils/response');

// In-memory store: Map<key, Map<identifier, { count, resetTime }>>
const stores = new Map();

function rateLimit({ key, max, windowMs, identifier }) {
  let store = stores.get(key);
  if (!store) { store = new Map(); stores.set(key, store); }

  const now = Date.now();
  let record = store.get(identifier);

  if (!record || now > record.resetTime) {
    store.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  record.count++;
  return record.count <= max;
}

function createRateLimitMiddleware({ key, max, windowMs, identifierFn }) {
  return (ctx, next) => {
    const identifier = identifierFn(ctx);
    if (!rateLimit({ key, max, windowMs, identifier })) {
      return Response.error(ctx, 'Rate limit exceeded', 429, 'RATE_LIMITED');
    }
    return next();
  };
}

function resetStore(key) {
  if (key) stores.delete(key); else stores.clear();
}

module.exports = { createRateLimitMiddleware, rateLimit, resetStore };
```

- [ ] **Step 2: 创建 ban-check.js**

```javascript
const Response = require('../utils/response');
const BanService = require('../services/ban.service');

const banCheck = async (ctx, next) => {
  const ip = ctx.ip;

  if (BanService.checkIp(ip)) {
    return Response.error(ctx, 'Access denied', 403, 'BANNED');
  }

  if (ctx.state.user) {
    const userId = String(ctx.state.user.id);
    if (BanService.isActive('user', userId)) {
      return Response.error(ctx, 'Account banned', 403, 'BANNED');
    }
  }

  return next();
};

module.exports = banCheck;
```

- [ ] **Step 3: Commit**

```bash
git add src/middleware/rate-limit.js src/middleware/ban-check.js
git commit -m "feat(middleware): add rate limiting and ban check middleware"
```

---

## Task 5: UserService 增加搜索 + 扩展 constants

**Files:**
- Modify: `src/services/user.service.js`
- Modify: `src/utils/constants.js`

- [ ] **Step 1: UserService 增加搜索参数**

修改 `src/services/user.service.js` 的 `getAll` 方法：

```javascript
  static getAll({ page = 1, limit = 50, search }) {
    const offset = (page - 1) * limit;
    const wheres = [];
    const params = [];

    if (search) {
      wheres.push('(username LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';

    const users = db.prepare(`
      SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const countResult = db.prepare(`SELECT COUNT(*) as total FROM users ${where}`).get(...params);

    return {
      data: users,
      pagination: { page, limit, total: countResult.total, totalPages: Math.ceil(countResult.total / limit) }
    };
  }
```

- [ ] **Step 2: 在 constants.js 的 LOG_ACTIONS 中追加**

在 `CATEGORY_DELETE: 'category_delete'` 之后追加：

```javascript
  SETTINGS_UPDATE: 'settings_update',
  POST_BULK_DELETE: 'post_bulk_delete',
  POST_BULK_PIN: 'post_bulk_pin',
  POST_BULK_MOVE: 'post_bulk_move',
  TAG_CREATE: 'tag_create',
  TAG_UPDATE: 'tag_update',
  TAG_DELETE: 'tag_delete',
  TAG_MERGE: 'tag_merge',
  MODERATION_APPROVE: 'moderation_approve',
  MODERATION_REJECT: 'moderation_reject',
  BAN_CREATE: 'ban_create',
  BAN_DEACTIVATE: 'ban_deactivate',
  CLEANUP_SESSIONS: 'cleanup_sessions',
  CLEANUP_LOGS: 'cleanup_logs',
  CLEANUP_SOFT_DELETED: 'cleanup_soft_deleted'
```

- [ ] **Step 3: Commit**

```bash
git add src/services/user.service.js src/utils/constants.js
git commit -m "feat: add user search and admin log actions to constants"
```

---

## Task 6: 扩展 admin controller

**Files:**
- Modify: `src/controllers/admin.controller.js`

- [ ] **Step 1: 替换 admin.controller.js 完整内容**

注意：需要在文件顶部添加 `const db = require('../database');`，并在顶部 import 新服务。

完整文件内容（替换整个文件）：

```javascript
const db = require('../database');
const Response = require('../utils/response');
const CategoryService = require('../services/category.service');
const PostService = require('../services/post.service');
const UserService = require('../services/user.service');
const LogService = require('../services/log.service');
const SettingService = require('../services/setting.service');
const StatService = require('../services/stat.service');
const BanService = require('../services/ban.service');
const TagService = require('../services/tag.service');
const { LOG_ACTIONS } = require('../utils/constants');

class AdminController {
  // ====== Existing methods (createCategory, updateCategory, deleteCategory, updateUserRole, pinPost, movePost, getLogs) — keep unchanged ======

  static createCategory(ctx) {
    const user = ctx.state.user;
    const { name, slug, sort_order } = ctx.request.body;
    const category = CategoryService.create({ name, slug, sort_order: parseInt(sort_order) || 0 });
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CATEGORY_CREATE, target_type: 'category', target_id: category.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.created(ctx, category);
  }

  static updateCategory(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { name, slug, sort_order, is_active } = ctx.request.body;
    const category = CategoryService.update(parseInt(id), { name, slug, sort_order: parseInt(sort_order) || undefined, is_active: parseInt(is_active) || undefined });
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CATEGORY_EDIT, target_type: 'category', target_id: category.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, category);
  }

  static deleteCategory(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    CategoryService.delete(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CATEGORY_DELETE, target_type: 'category', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Category deleted' });
  }

  static updateUserRole(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { role } = ctx.request.body;
    if (!['guest', 'user', 'moderator', 'admin'].includes(role)) { Response.error(ctx, 'Invalid role', 400); return; }
    const targetUser = UserService.getById(parseInt(id));
    if (!targetUser) { Response.notFound(ctx, 'User not found'); return; }
    const updatedUser = UserService.updateRole(parseInt(id), role);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.USER_ROLE_CHANGE, target_type: 'user', target_id: parseInt(id), details: { old_role: targetUser.role, new_role: role }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, updatedUser);
  }

  static pinPost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { is_pinned } = ctx.request.body;
    const post = PostService.pin(parseInt(id), is_pinned);
    if (!post) { Response.notFound(ctx, 'Post not found'); return; }
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_PIN, target_type: 'post', target_id: post.id, details: { is_pinned }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, post);
  }

  static movePost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { category_id } = ctx.request.body;
    const category = CategoryService.getById(parseInt(category_id));
    if (!category) { Response.notFound(ctx, 'Target category not found'); return; }
    const post = PostService.move(parseInt(id), parseInt(category_id));
    if (!post) { Response.notFound(ctx, 'Post not found'); return; }
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_MOVE, target_type: 'post', target_id: post.id, details: { old_category_id: post.category_id, new_category_id: category_id }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, post);
  }

  static getLogs(ctx) {
    const { page, limit, user_id, action, target_type } = ctx.query;
    const result = LogService.getLogs({ page: parseInt(page) || 1, limit: parseInt(limit) || 50, user_id: parseInt(user_id) || null, action: action || null, target_type: target_type || null });
    Response.paginated(ctx, result.data, result.pagination);
  }

  // ====== NEW: Stats ======
  static getStats(ctx) {
    const stats = StatService.getDashboardStats();
    Response.success(ctx, stats);
  }

  // ====== NEW: Settings ======
  static getSettings(ctx) {
    const { category } = ctx.params;
    if (category) {
      Response.success(ctx, SettingService.getByCategory(category));
    } else {
      Response.success(ctx, SettingService.getAll());
    }
  }

  static updateSettings(ctx) {
    const user = ctx.state.user;
    const { category } = ctx.params;
    const updates = ctx.request.body;
    const result = SettingService.setBatch(category, updates);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.SETTINGS_UPDATE, target_type: 'settings', target_id: category, details: { keys: Object.keys(updates) }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, result);
  }

  // ====== NEW: Users list ======
  static getUsers(ctx) {
    const { page, limit, search } = ctx.query;
    const result = UserService.getAll({ page: parseInt(page) || 1, limit: parseInt(limit) || 20, search: search || null });
    Response.paginated(ctx, result.data, result.pagination);
  }

  // ====== NEW: Posts list for admin ======
  static getPosts(ctx) {
    const { page, limit, status, category_id } = ctx.query;
    const whereClauses = ['p.deleted_at IS NULL'];
    const params = [];
    if (status && status !== 'all') { whereClauses.push("p.status = ?"); params.push(status); }
    if (category_id && category_id !== 'all') { whereClauses.push('p.category_id = ?'); params.push(parseInt(category_id)); }
    const whereClause = whereClauses.join(' AND ');
    const limitVal = parseInt(limit) || 20;
    const offset = ((parseInt(page) || 1) - 1) * limitVal;
    const posts = db.prepare(`
      SELECT p.*, c.name as category_name, u.username as author_username
      FROM posts p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN users u ON p.user_id = u.id
      WHERE ${whereClause} ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limitVal, offset);
    const total = db.prepare(`SELECT COUNT(*) as total FROM posts p WHERE ${whereClause}`).get(...params).total;
    Response.paginated(ctx, posts, { page: parseInt(page) || 1, limit: limitVal, total, totalPages: Math.ceil(total / limitVal) });
  }

  // ====== NEW: Bulk post operations ======
  static bulkDeletePosts(ctx) {
    const user = ctx.state.user;
    const { post_ids } = ctx.request.body;
    if (!post_ids || !post_ids.length) { Response.error(ctx, 'No posts selected', 400); return; }
    const stmt = db.prepare("UPDATE posts SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ?");
    db.transaction(() => { for (const id of post_ids) stmt.run(id); })();
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_BULK_DELETE, target_type: 'posts', details: { count: post_ids.length }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${post_ids.length} posts deleted` });
  }

  static bulkPinPosts(ctx) {
    const user = ctx.state.user;
    const { post_ids, is_pinned } = ctx.request.body;
    if (!post_ids || !post_ids.length) { Response.error(ctx, 'No posts selected', 400); return; }
    const stmt = db.prepare('UPDATE posts SET is_pinned = ? WHERE id = ?');
    db.transaction(() => { for (const id of post_ids) stmt.run(is_pinned ? 1 : 0, id); })();
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_BULK_PIN, target_type: 'posts', details: { count: post_ids.length, is_pinned }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${post_ids.length} posts ${is_pinned ? 'pinned' : 'unpinned'}` });
  }

  static bulkMovePosts(ctx) {
    const user = ctx.state.user;
    const { post_ids, category_id } = ctx.request.body;
    if (!post_ids || !post_ids.length) { Response.error(ctx, 'No posts selected', 400); return; }
    const category = CategoryService.getById(parseInt(category_id));
    if (!category) { Response.notFound(ctx, 'Target category not found'); return; }
    const stmt = db.prepare('UPDATE posts SET category_id = ? WHERE id = ?');
    db.transaction(() => { for (const id of post_ids) stmt.run(parseInt(category_id), id); })();
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.POST_BULK_MOVE, target_type: 'posts', details: { count: post_ids.length, category_id }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${post_ids.length} posts moved` });
  }

  // ====== NEW: Tags CRUD ======
  static getTags(ctx) {
    const tags = TagService.getAll();
    Response.success(ctx, tags);
  }

  static createTag(ctx) {
    const user = ctx.state.user;
    const { name, slug } = ctx.request.body;
    const finalSlug = slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (TagService.getBySlug(finalSlug)) { Response.error(ctx, 'Tag already exists', 409); return; }
    const result = db.prepare('INSERT INTO tags (name, slug) VALUES (?, ?)').run(name, finalSlug);
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_CREATE, target_type: 'tag', target_id: tag.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.created(ctx, tag);
  }

  static updateTag(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { name, slug } = ctx.request.body;
    const fields = []; const values = [];
    if (name) { fields.push('name = ?'); values.push(name); }
    if (slug) { fields.push('slug = ?'); values.push(slug); }
    if (!fields.length) { Response.error(ctx, 'No fields to update', 400); return; }
    values.push(parseInt(id));
    db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_UPDATE, target_type: 'tag', target_id: tag.id, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, tag);
  }

  static deleteTag(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    db.prepare('DELETE FROM tags WHERE id = ?').run(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_DELETE, target_type: 'tag', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Tag deleted' });
  }

  static mergeTags(ctx) {
    const user = ctx.state.user;
    const { from_tag_id, to_tag_id } = ctx.request.body;
    if (!from_tag_id || !to_tag_id) { Response.error(ctx, 'Both from_tag_id and to_tag_id required', 400); return; }
    const fromTag = db.prepare('SELECT * FROM tags WHERE id = ?').get(parseInt(from_tag_id));
    const toTag = db.prepare('SELECT * FROM tags WHERE id = ?').get(parseInt(to_tag_id));
    if (!fromTag || !toTag) { Response.notFound(ctx, 'Tag not found'); return; }
    db.prepare('UPDATE OR IGNORE post_tags SET tag_id = ? WHERE tag_id = ?').run(toTag.id, fromTag.id);
    db.prepare('DELETE FROM tags WHERE id = ?').run(fromTag.id);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.TAG_MERGE, target_type: 'tag', details: { from: fromTag.name, to: toTag.name }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `Merged "${fromTag.name}" into "${toTag.name}"` });
  }

  // ====== NEW: Moderation ======
  static getModerationQueue(ctx) {
    const { page, limit, type } = ctx.query;
    const limitVal = parseInt(limit) || 20;
    const offset = ((parseInt(page) || 1) - 1) * limitVal;

    let items = [];
    if (!type || type === 'posts') {
      const posts = db.prepare(`
        SELECT p.*, u.username as author_username, 'post' as item_type
        FROM posts p LEFT JOIN users u ON p.user_id = u.id
        WHERE p.status = 'pending' ORDER BY p.created_at ASC LIMIT ? OFFSET ?
      `).all(limitVal, offset);
      items = posts;
    }
    if (!type || type === 'replies') {
      const replies = db.prepare(`
        SELECT r.*, u.username as author_username, 'reply' as item_type
        FROM replies r LEFT JOIN users u ON r.user_id = u.id
        WHERE r.status = 'pending' ORDER BY r.created_at ASC LIMIT ? OFFSET ?
      `).all(limitVal, offset);
      items = [...items, ...replies];
    }

    Response.paginated(ctx, items, { page: parseInt(page) || 1, limit: limitVal, total: items.length, totalPages: 1 });
  }

  static approvePost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    db.prepare("UPDATE posts SET status = 'published' WHERE id = ?").run(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.MODERATION_APPROVE, target_type: 'post', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Post approved' });
  }

  static rejectPost(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    db.prepare("UPDATE posts SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.MODERATION_REJECT, target_type: 'post', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: 'Post rejected' });
  }

  // ====== NEW: Bans ======
  static getBans(ctx) {
    const { page, limit, ban_type, is_active } = ctx.query;
    const result = BanService.getList({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      ban_type: ban_type || null,
      is_active: is_active !== undefined ? is_active === 'true' : undefined
    });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static createBan(ctx) {
    const user = ctx.state.user;
    const { ban_type, value, reason } = ctx.request.body;
    if (!ban_type || !value) { Response.error(ctx, 'ban_type and value required', 400); return; }
    const ban = BanService.create({ ban_type, value, reason, created_by: user.id });
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.BAN_CREATE, target_type: 'ban', target_id: ban.id, details: { ban_type, value }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.created(ctx, ban);
  }

  static updateBan(ctx) {
    const { id } = ctx.params;
    const ban = BanService.update(parseInt(id), ctx.request.body);
    if (!ban) { Response.notFound(ctx, 'Ban not found'); return; }
    Response.success(ctx, ban);
  }

  static deactivateBan(ctx) {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const ban = BanService.deactivate(parseInt(id));
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.BAN_DEACTIVATE, target_type: 'ban', target_id: parseInt(id), ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, ban);
  }

  // ====== NEW: Cleanup ======
  static cleanupSessions(ctx) {
    const user = ctx.state.user;
    const result = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CLEANUP_SESSIONS, target_type: 'sessions', details: { deleted: result.changes }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${result.changes} sessions cleaned` });
  }

  static cleanupLogs(ctx) {
    const user = ctx.state.user;
    const days = SettingService.getNumber('cleanup_log_retention_days') || 90;
    const result = db.prepare("DELETE FROM operation_logs WHERE created_at < datetime('now', ?)").run(`-${days} days`);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CLEANUP_LOGS, target_type: 'logs', details: { deleted: result.changes }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${result.changes} logs cleaned` });
  }

  static cleanupSoftDeleted(ctx) {
    const user = ctx.state.user;
    const days = SettingService.getNumber('cleanup_soft_delete_retention_days') || 30;
    const postsResult = db.prepare("UPDATE posts SET content = '[deleted]', content_html = '[deleted]', deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)").run(`-${days} days`);
    const repliesResult = db.prepare("UPDATE replies SET content = '[deleted]', content_html = '[deleted]', deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)").run(`-${days} days`);
    LogService.log({ user_id: user.id, action: LOG_ACTIONS.CLEANUP_SOFT_DELETED, target_type: 'soft_deleted', details: { posts: postsResult.changes, replies: repliesResult.changes }, ip_address: ctx.ip, user_agent: ctx.headers['user-agent'] });
    Response.success(ctx, { message: `${postsResult.changes} posts, ${repliesResult.changes} replies purged` });
  }
}

module.exports = AdminController;
```

- [ ] **Step 2: Commit**

```bash
git add src/controllers/admin.controller.js src/utils/constants.js
git commit -m "feat(controller): expand admin controller with stats, settings, tags, moderation, bans, cleanup"
```

---

## Task 7: 扩展 admin routes

**Files:**
- Modify: `src/routes/admin.routes.js`

- [ ] **Step 1: 替换 admin.routes.js**

完整文件内容：

```javascript
const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { requireAdmin, requireModerator } = require('../middleware/permission');
const { CATEGORY_SCHEMA, ROLE_SCHEMA } = require('../validators/common.validator');
const AdminController = require('../controllers/admin.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/admin` });

  // === Stats ===
  router.get('/stats', authMiddleware({ required: true }), AdminController.getStats);

  // === Settings ===
  router.get('/settings', authMiddleware({ required: true }), requireAdmin, AdminController.getSettings);
  router.get('/settings/:category', authMiddleware({ required: true }), requireAdmin, AdminController.getSettings);
  router.put('/settings/:category', authMiddleware({ required: true }), requireAdmin, AdminController.updateSettings);

  // === Users ===
  router.get('/users', authMiddleware({ required: true }), requireAdmin, AdminController.getUsers);
  router.put('/users/:id/role', authMiddleware({ required: true }), requireAdmin, validate(ROLE_SCHEMA), AdminController.updateUserRole);

  // === Posts ===
  router.get('/posts', authMiddleware({ required: true }), requireModerator, AdminController.getPosts);
  router.delete('/posts', authMiddleware({ required: true }), requireModerator, AdminController.bulkDeletePosts);
  router.put('/posts/pin', authMiddleware({ required: true }), requireModerator, AdminController.bulkPinPosts);
  router.put('/posts/move', authMiddleware({ required: true }), requireModerator, AdminController.bulkMovePosts);
  router.put('/posts/:id/pin', authMiddleware({ required: true }), requireModerator, AdminController.pinPost);
  router.put('/posts/:id/move', authMiddleware({ required: true }), requireModerator, AdminController.movePost);

  // === Categories ===
  router.post('/categories', authMiddleware({ required: true }), requireAdmin, validate(CATEGORY_SCHEMA), AdminController.createCategory);
  router.put('/categories/:id', authMiddleware({ required: true }), requireAdmin, validate(CATEGORY_SCHEMA), AdminController.updateCategory);
  router.delete('/categories/:id', authMiddleware({ required: true }), requireAdmin, AdminController.deleteCategory);

  // === Tags ===
  router.get('/tags', authMiddleware({ required: true }), requireAdmin, AdminController.getTags);
  router.post('/tags', authMiddleware({ required: true }), requireAdmin, AdminController.createTag);
  router.put('/tags/:id', authMiddleware({ required: true }), requireAdmin, AdminController.updateTag);
  router.delete('/tags/:id', authMiddleware({ required: true }), requireAdmin, AdminController.deleteTag);
  router.post('/tags/merge', authMiddleware({ required: true }), requireAdmin, AdminController.mergeTags);

  // === Moderation ===
  router.get('/moderation', authMiddleware({ required: true }), requireModerator, AdminController.getModerationQueue);
  router.put('/moderation/:id/approve', authMiddleware({ required: true }), requireModerator, AdminController.approvePost);
  router.put('/moderation/:id/reject', authMiddleware({ required: true }), requireModerator, AdminController.rejectPost);

  // === Bans ===
  router.get('/bans', authMiddleware({ required: true }), requireAdmin, AdminController.getBans);
  router.post('/bans', authMiddleware({ required: true }), requireAdmin, AdminController.createBan);
  router.put('/bans/:id', authMiddleware({ required: true }), requireAdmin, AdminController.updateBan);
  router.delete('/bans/:id', authMiddleware({ required: true }), requireAdmin, AdminController.deactivateBan);

  // === Cleanup ===
  router.post('/cleanup/sessions', authMiddleware({ required: true }), requireAdmin, AdminController.cleanupSessions);
  router.post('/cleanup/logs', authMiddleware({ required: true }), requireAdmin, AdminController.cleanupLogs);
  router.post('/cleanup/soft-deleted', authMiddleware({ required: true }), requireAdmin, AdminController.cleanupSoftDeleted);

  // === Logs ===
  router.get('/logs', authMiddleware({ required: true }), requireAdmin, AdminController.getLogs);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
```

- [ ] **Step 2: 在 database/index.js 中 seed settings 默认值**

在 `src/database/index.js` 的 `initialize()` 函数末尾（`console.log` 之前）添加：

```javascript
  // Seed default settings for admin panel
  const SettingService = require('../services/setting.service');
  SettingService.seedDefaults();
```

- [ ] **Step 3: 验证后端能启动**

```bash
node -e "require('./src/database').initialize(); require('./src/routes/admin.routes'); console.log('Routes loaded OK'); process.exit(0);"
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin.routes.js src/database/index.js
git commit -m "feat(routes): register all new admin endpoints + seed defaults on DB init"
```

---

## Task 8: 前端类型 + API 客户端

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api/client.ts`

- [ ] **Step 1: 在 types/index.ts 末尾追加**

```typescript
// Admin panel types
export interface AdminStats {
  total_posts: number;
  total_replies: number;
  total_users: number;
  active_24h: number;
  today_posts: number;
  today_replies: number;
  today_users: number;
  activity_7d: number[];
}

export interface AdminBan {
  id: number;
  ban_type: string;
  value: string;
  reason: string | null;
  created_by: number;
  created_at: string;
  is_active: boolean;
  creator_name: string | null;
}

export interface AdminBanListResponse {
  data: AdminBan[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateBanInput {
  ban_type: 'ip' | 'ip_range' | 'user';
  value: string;
  reason?: string;
}

export interface ModerationItem {
  id: number;
  item_type: 'post' | 'reply';
  title?: string;
  content: string;
  author_username: string;
  created_at: string;
  post_id?: number;
}
```

- [ ] **Step 2: 在 client.ts 的 adminApi 对象中追加方法**

在现有 adminApi 的 `getUsers` 后面追加：

```typescript
  getStats: () =>
    request<AdminStats>('/api/admin/stats'),
  getSettings: (category?: string) =>
    request<Record<string, string>>(`/api/admin/settings${category ? `/${category}` : ''}`),
  updateSettings: (category: string, data: Record<string, string>) =>
    request<Record<string, string>>(`/api/admin/settings/${category}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getTags: () =>
    request<Tag[]>('/api/admin/tags'),
  createTag: (data: { name: string; slug?: string }) =>
    request<Tag>('/api/admin/tags', { method: 'POST', body: JSON.stringify(data) }),
  updateTag: (id: number, data: { name?: string; slug?: string }) =>
    request<Tag>(`/api/admin/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTag: (id: number) =>
    request<void>(`/api/admin/tags/${id}`, { method: 'DELETE' }),
  mergeTags: (from_tag_id: number, to_tag_id: number) =>
    request<{ message: string }>('/api/admin/tags/merge', {
      method: 'POST', body: JSON.stringify({ from_tag_id, to_tag_id }),
    }),
  getModeration: (params?: { page?: number; limit?: number; type?: string }) =>
    request<{ data: ModerationItem[]; pagination: PostListResponse['pagination'] }>(
      `/api/admin/moderation${buildQueryString({ page: params?.page, limit: params?.limit, type: params?.type })}`
    ),
  approvePost: (id: number) =>
    request<{ message: string }>(`/api/admin/moderation/${id}/approve`, { method: 'PUT' }),
  rejectPost: (id: number) =>
    request<{ message: string }>(`/api/admin/moderation/${id}/reject`, { method: 'PUT' }),
  getBans: (params?: { page?: number; limit?: number; ban_type?: string; is_active?: string }) =>
    request<AdminBanListResponse>(`/api/admin/bans${buildQueryString({ page: params?.page, limit: params?.limit, ban_type: params?.ban_type, is_active: params?.is_active })}`),
  createBan: (data: CreateBanInput) =>
    request<AdminBan>('/api/admin/bans', { method: 'POST', body: JSON.stringify(data) }),
  updateBan: (id: number, data: Partial<CreateBanInput>) =>
    request<AdminBan>(`/api/admin/bans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateBan: (id: number) =>
    request<AdminBan>(`/api/admin/bans/${id}`, { method: 'DELETE' }),
  cleanupSessions: () =>
    request<{ message: string }>('/api/admin/cleanup/sessions', { method: 'POST' }),
  cleanupLogs: () =>
    request<{ message: string }>('/api/admin/cleanup/logs', { method: 'POST' }),
  cleanupSoftDeleted: () =>
    request<{ message: string }>('/api/admin/cleanup/soft-deleted', { method: 'POST' }),
  bulkDeletePosts: (post_ids: number[]) =>
    request<{ message: string }>('/api/admin/posts', { method: 'DELETE', body: JSON.stringify({ post_ids }) }),
  bulkPinPosts: (post_ids: number[], is_pinned: boolean) =>
    request<{ message: string }>('/api/admin/posts/pin', { method: 'PUT', body: JSON.stringify({ post_ids, is_pinned }) }),
  bulkMovePosts: (post_ids: number[], category_id: number) =>
    request<{ message: string }>('/api/admin/posts/move', { method: 'PUT', body: JSON.stringify({ post_ids, category_id }) }),
```

- [ ] **Step 3: 在 client.ts import 中添加类型**

在 import 行中的 `AdminLog` 后面添加 `AdminStats, AdminBan, AdminBanListResponse, CreateBanInput, ModerationItem`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api/client.ts
git commit -m "feat(frontend): add admin API types and client methods"
```

---

## Task 9: 侧边栏 + 仪表盘

**Files:**
- Modify: `frontend/src/components/admin/admin-sidebar.tsx`
- Modify: `frontend/src/components/admin/dashboard.tsx`

- [ ] **Step 1: 替换 admin-sidebar.tsx**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';

const navSections = [
  {
    title: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: '◈', roles: ['admin', 'moderator'] },
    ],
  },
  {
    title: 'Site',
    items: [
      { href: '/admin/settings/basic', label: 'Basic Info', icon: '◼', roles: ['admin'] },
      { href: '/admin/settings/announce', label: 'Announcements', icon: '◻', roles: ['admin'] },
      { href: '/admin/settings/display', label: 'Display', icon: '▭', roles: ['admin'] },
      { href: '/admin/settings/seo', label: 'SEO', icon: '◇', roles: ['admin'] },
    ],
  },
  {
    title: 'Content',
    items: [
      { href: '/admin/posts', label: 'Posts', icon: '▣', roles: ['admin', 'moderator'] },
      { href: '/admin/content/tags', label: 'Tags', icon: '⧫', roles: ['admin'] },
      { href: '/admin/content/moderation', label: 'Moderation', icon: '△', roles: ['admin', 'moderator'] },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/admin/system/rules', label: 'Posting Rules', icon: '⊠', roles: ['admin'] },
      { href: '/admin/system/rate-limits', label: 'Rate Limits', icon: '◷', roles: ['admin'] },
      { href: '/admin/system/bans', label: 'Bans', icon: '⊘', roles: ['admin'] },
      { href: '/admin/system/cleanup', label: 'Data Cleanup', icon: '◎', roles: ['admin'] },
    ],
  },
  {
    title: 'Manage',
    items: [
      { href: '/admin/categories', label: 'Categories', icon: '▤', roles: ['admin'] },
      { href: '/admin/users', label: 'Users', icon: '⬡', roles: ['admin'] },
      { href: '/admin/logs', label: 'Logs', icon: '▦', roles: ['admin'] },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const userRole = user?.role ?? '';

  const allItems = navSections.flatMap((section) =>
    section.items.filter((item) => item.roles.includes(userRole as string))
  );

  if (!allItems.length) return null;

  return (
    <aside className="w-64 bg-surface-900 text-surface-300 min-h-screen border-r border-surface-800">
      <div className="p-6 border-b border-surface-800">
        <h2 className="text-sm font-bold text-white tracking-wide">MINDFORUM</h2>
        <p className="text-xs text-surface-500 mt-1 tracking-widest uppercase">Administration</p>
      </div>
      <nav className="py-3">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) =>
            item.roles.includes(userRole as string)
          );
          if (!visibleItems.length) return null;
          return (
            <div key={section.title} className="mb-2">
              <div className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-surface-600">
                {section.title}
              </div>
              {visibleItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-surface-800 text-white'
                        : 'text-surface-400 hover:bg-surface-800/50 hover:text-white'
                    }`}
                  >
                    <span className="w-5 text-center text-base opacity-60">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
        <div className="px-5 pt-3">
          <Link href="/" className="text-sm text-surface-500 hover:text-white transition-colors">
            ← 返回论坛
          </Link>
        </div>
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: 替换 dashboard.tsx**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api/client';
import type { AdminStats } from '@/types';

const quickLinks = [
  { href: '/admin/settings/basic', label: 'Site Settings', icon: '◼' },
  { href: '/admin/posts', label: 'Posts', icon: '▣' },
  { href: '/admin/content/moderation', label: 'Moderation', icon: '△' },
  { href: '/admin/system/bans', label: 'Bans', icon: '⊘' },
  { href: '/admin/categories', label: 'Categories', icon: '▤' },
  { href: '/admin/logs', label: 'Logs', icon: '▦' },
];

const chartDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    { label: 'POSTS', value: stats?.total_posts ?? '--', trend: stats ? `+${stats.today_posts} today` : '' },
    { label: 'REPLIES', value: stats?.total_replies ?? '--', trend: stats ? `+${stats.today_replies} today` : '' },
    { label: 'USERS', value: stats?.total_users ?? '--', trend: stats ? `+${stats.today_users} today` : '' },
    { label: 'ACTIVE 24H', value: stats?.active_24h ?? '--', trend: '' },
  ];

  const maxActivity = stats ? Math.max(...stats.activity_7d, 1) : 1;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-surface-900" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-surface-200 border border-surface-200">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white p-6">
            <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">{card.label}</div>
            <div className="text-3xl font-light text-surface-900">{card.value}</div>
            {card.trend && <div className="text-xs text-surface-400 mt-2">{card.trend}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity chart */}
        <div className="lg:col-span-2 bg-white border border-surface-200">
          <div className="px-5 py-4 border-b border-surface-200">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-600">7-Day Activity</h3>
          </div>
          <div className="flex items-end justify-center gap-2 h-36 px-5 py-6">
            {stats?.activity_7d.map((val, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-5 bg-surface-300 rounded-sm" style={{ height: `${Math.max((val / maxActivity) * 120, 4)}px` }} />
                <span className="text-xs text-surface-400 font-mono">{chartDays[i]}</span>
              </div>
            ))}
            {!stats && <span className="text-surface-400">No data</span>}
          </div>
        </div>

        {/* Quick access */}
        <div className="bg-white border border-surface-200">
          <div className="px-5 py-4 border-b border-surface-200">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-600">Quick Access</h3>
          </div>
          <div>
            {quickLinks.map((link) => (
              <Link key={link.href} href={link.href} className="flex items-center gap-3 px-5 py-3 text-sm text-surface-600 border-b border-surface-100 hover:bg-surface-50 hover:text-surface-900 transition-colors last:border-b-0">
                <span className="opacity-50">{link.icon}</span>
                {link.label}
                <span className="ml-auto text-surface-300">→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/admin-sidebar.tsx frontend/src/components/admin/dashboard.tsx
git commit -m "feat(frontend): redesign admin sidebar with unicode icons + connect dashboard to real stats API"
```

---

## Task 10: 设置页面（4 个页面 + 共享布局）

**Files:**
- Create: `frontend/src/app/admin/settings/layout.tsx`
- Create: `frontend/src/app/admin/settings/basic/page.tsx`
- Create: `frontend/src/app/admin/settings/announce/page.tsx`
- Create: `frontend/src/app/admin/settings/display/page.tsx`
- Create: `frontend/src/app/admin/settings/seo/page.tsx`

- [ ] **Step 1: 创建 settings/layout.tsx（子导航）**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/admin/settings/basic', label: 'Basic Info' },
  { href: '/admin/settings/announce', label: 'Announcements' },
  { href: '/admin/settings/display', label: 'Display' },
  { href: '/admin/settings/seo', label: 'SEO' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">Site Settings</h1>
        <p className="text-sm text-surface-500 mt-1">Configure site identity, display and SEO</p>
      </div>
      <div className="flex gap-1 border-b border-surface-200">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              pathname === tab.href
                ? 'border-surface-900 text-surface-900 font-medium'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 创建 settings/basic/page.tsx**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function BasicSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await adminApi.getSettings('basic');
      setValues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateSettings('basic', values);
      setMessage('Settings saved successfully');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, val: string) => setValues((prev) => ({ ...prev, [key]: val }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">Site Identity</h2>
        <p className="text-xs text-surface-400 mt-1">Displayed in browser title, navigation bar and footer</p>
      </div>
      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Forum Name</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_name ?? ''} onChange={(e) => update('site_name', e.target.value)} />
          <p className="text-xs text-surface-400 mt-1">Appears in browser title, navigation and footer</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Tagline</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_tagline ?? ''} onChange={(e) => update('site_tagline', e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Description</label>
          <textarea className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400 min-h-[80px]" value={values.site_description ?? ''} onChange={(e) => update('site_description', e.target.value)} />
          <p className="text-xs text-surface-400 mt-1">Used on homepage and for SEO</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Logo URL</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_logo_url ?? ''} onChange={(e) => update('site_logo_url', e.target.value)} placeholder="/logo.png" />
          <p className="text-xs text-surface-400 mt-1">Leave empty to display text logo</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Footer Copyright</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_footer ?? ''} onChange={(e) => update('site_footer', e.target.value)} />
        </div>
      </div>
      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 settings/announce/page.tsx**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function AnnounceSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setValues(await adminApi.getSettings('announce'));
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateSettings('announce', values);
      setMessage('Saved');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">Announcements</h2>
        <p className="text-xs text-surface-400 mt-1">Homepage banner announcements, Markdown supported</p>
      </div>
      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={values.announce_enabled === 'true'} onChange={(e) => update('announce_enabled', e.target.checked ? 'true' : 'false')} className="w-4 h-4 accent-surface-900" />
            <span className="text-sm text-surface-700">Enable announcements</span>
          </label>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Content</label>
          <textarea className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400 min-h-[120px]" value={values.announce_content ?? ''} onChange={(e) => update('announce_content', e.target.value)} placeholder="Announcement text (Markdown supported)" />
        </div>
      </div>
      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 settings/display/page.tsx**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function DisplaySettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try { setValues(await adminApi.getSettings('display')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await adminApi.updateSettings('display', values); setMessage('Saved'); setTimeout(() => setMessage(null), 3000); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">Display Settings</h2>
        <p className="text-xs text-surface-400 mt-1">Control homepage and list display behavior</p>
      </div>
      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Posts Per Page</label>
          <input type="number" className="w-32 px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.posts_per_page ?? '20'} onChange={(e) => update('posts_per_page', e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Default Sort</label>
          <select className="px-3 py-2 border border-surface-200 rounded text-sm" value={values.default_sort ?? 'newest'} onChange={(e) => update('default_sort', e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="popular">Most popular</option>
            <option value="replies">Most replies</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Replies Per Page</label>
          <input type="number" className="w-32 px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.replies_per_page ?? '50'} onChange={(e) => update('replies_per_page', e.target.value)} />
          <p className="text-xs text-surface-400 mt-1">Number of replies per page in post detail view</p>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 创建 settings/seo/page.tsx**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function SeoSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try { setValues(await adminApi.getSettings('seo')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await adminApi.updateSettings('seo', values); setMessage('Saved'); setTimeout(() => setMessage(null), 3000); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">SEO Settings</h2>
        <p className="text-xs text-surface-400 mt-1">Optimize search engine indexing</p>
      </div>
      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Title Suffix</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.seo_title_suffix ?? ''} onChange={(e) => update('seo_title_suffix', e.target.value)} />
          <p className="text-xs text-surface-400 mt-1">Appended to page titles, e.g. "Post Title | MindForum"</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Default Description</label>
          <textarea className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400 min-h-[60px]" value={values.seo_default_description ?? ''} onChange={(e) => update('seo_default_description', e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">OG Image URL</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.seo_og_image ?? ''} onChange={(e) => update('seo_og_image', e.target.value)} placeholder="https://example.com/og-image.png" />
          <p className="text-xs text-surface-400 mt-1">Default image for social sharing (recommended 1200×630px)</p>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={values.seo_sitemap_enabled === 'true'} onChange={(e) => update('seo_sitemap_enabled', e.target.checked ? 'true' : 'false')} className="w-4 h-4 accent-surface-900" />
            <span className="text-sm text-surface-700">Enable sitemap.xml</span>
          </label>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={values.seo_robots_enabled === 'true'} onChange={(e) => update('seo_robots_enabled', e.target.checked ? 'true' : 'false')} className="w-4 h-4 accent-surface-900" />
            <span className="text-sm text-surface-700">Enable robots.txt</span>
          </label>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/settings/
git commit -m "feat(frontend): add 4 settings pages (basic, announce, display, seo) with shared layout"
```

---

## Task 11: 内容管理页面（标签 + 审核）

**Files:**
- Create: `frontend/src/app/admin/content/tags/page.tsx`
- Create: `frontend/src/app/admin/content/moderation/page.tsx`

- [ ] **Step 1: 创建 content/tags/page.tsx**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import type { Tag } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    try {
      const data = await adminApi.getTags();
      setTags(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await adminApi.createTag({ name: newName.trim(), slug: newSlug.trim() || undefined });
      setNewName(''); setNewSlug('');
      setMessage('Tag created'); fetchTags();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleDelete = async (tag: Tag) => {
    if (!confirm(`Delete tag "${tag.name}"?`)) return;
    try { await adminApi.deleteTag(tag.id); setMessage('Tag deleted'); fetchTags(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleMerge = async () => {
    const fromId = tags.find(t => t.name.toLowerCase() === mergeFrom.toLowerCase())?.id;
    const toId = tags.find(t => t.name.toLowerCase() === mergeTo.toLowerCase())?.id;
    if (!fromId || !toId) { setError('Both tags must exist'); return; }
    try {
      await adminApi.mergeTags(fromId, toId);
      setMessage('Tags merged'); setMergeFrom(''); setMergeTo(''); fetchTags();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">Tag Management</h1>
        <p className="text-sm text-surface-500 mt-1">Create, edit, delete and merge tags</p>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {/* Tags list */}
      <div className="bg-white border border-surface-200">
        <div className="px-5 py-4 border-b border-surface-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-600">Existing Tags</h2>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {tags.map((tag) => (
            <span key={tag.id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-50 border border-surface-200 rounded text-sm text-surface-600">
              {tag.name}
              <span className="text-xs text-surface-400 font-mono">{(tag as any).post_count ?? 0}</span>
              <button onClick={() => handleDelete(tag)} className="text-surface-300 hover:text-surface-600">×</button>
            </span>
          ))}
          {tags.length === 0 && <span className="text-surface-400 text-sm">No tags</span>}
        </div>
      </div>

      {/* Create tag */}
      <div className="bg-white border border-surface-200">
        <div className="px-5 py-4 border-b border-surface-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-600">New Tag</h2>
        </div>
        <div className="p-4 flex gap-2 items-end">
          <div>
            <label className="block text-xs text-surface-500 mb-1">Name</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tag name" />
          </div>
          <div>
            <label className="block text-xs text-surface-500 mb-1">Slug (optional)</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="auto-generated" />
          </div>
          <Button onClick={handleCreate}>Create</Button>
        </div>
      </div>

      {/* Merge tags */}
      <div className="bg-white border border-surface-200">
        <div className="px-5 py-4 border-b border-surface-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-600">Merge Tags</h2>
        </div>
        <div className="p-4 flex gap-2 items-end">
          <div>
            <label className="block text-xs text-surface-500 mb-1">From</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm" value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} placeholder="Source tag name" />
          </div>
          <div>
            <label className="block text-xs text-surface-500 mb-1">Into</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm" value={mergeTo} onChange={(e) => setMergeTo(e.target.value)} placeholder="Target tag name" />
          </div>
          <Button variant="ghost" onClick={handleMerge}>Merge</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 content/moderation/page.tsx**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import type { ModerationItem } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function ModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('posts');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getModeration({ type: filter });
      setItems(res.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleApprove = async (id: number) => {
    try { await adminApi.approvePost(id); setMessage('Approved'); fetchItems(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleReject = async (id: number) => {
    try { await adminApi.rejectPost(id); setMessage('Rejected'); fetchItems(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">Content Moderation</h1>
          <p className="text-sm text-surface-500 mt-1">Review pending posts and replies</p>
        </div>
        <select className="px-3 py-2 border border-surface-200 rounded text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="posts">Posts</option>
          <option value="replies">Replies</option>
        </select>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      <div className="bg-white border border-surface-200 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-surface-400">No pending items</div>
        ) : (
          <div>
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-4 p-4 border-b border-surface-100 last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-surface-500">{item.item_type}</span>
                    <span className="text-xs text-surface-400">{item.author_username}</span>
                    <span className="text-xs text-surface-400 font-mono">{new Date(item.created_at).toLocaleString('zh-CN')}</span>
                  </div>
                  <p className="text-sm text-surface-700 truncate">{item.content}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handleApprove(item.id)}>Approve</Button>
                  <Button variant="danger" size="sm" onClick={() => handleReject(item.id)}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/admin/content/
git commit -m "feat(frontend): add tags management and moderation queue pages"
```

---

## Task 12: 系统配置页面（4 个页面）

**Files:**
- Create: `frontend/src/app/admin/system/rules/page.tsx`
- Create: `frontend/src/app/admin/system/rate-limits/page.tsx`
- Create: `frontend/src/app/admin/system/bans/page.tsx`
- Create: `frontend/src/app/admin/system/cleanup/page.tsx`

- [ ] **Step 1: 创建 system/rules/page.tsx**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

const fields = [
  { key: 'title_min_length', label: 'Title Min Length', unit: 'chars' },
  { key: 'title_max_length', label: 'Title Max Length', unit: 'chars' },
  { key: 'content_min_length', label: 'Content Min Length', unit: 'chars' },
  { key: 'max_tags_per_post', label: 'Max Tags Per Post', unit: '' },
  { key: 'max_tag_length', label: 'Max Tag Length', unit: 'chars' },
];

export default function RulesPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try { setValues(await adminApi.getSettings('rules')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await adminApi.updateSettings('rules', values); setMessage('Saved'); setTimeout(() => setMessage(null), 3000); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">Posting Rules</h1>
        <p className="text-sm text-surface-500 mt-1">Content length and tag limits for posts and replies</p>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      <div className="bg-white border border-surface-200">
        <div className="px-6 py-4 border-b border-surface-200">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">Content Limits</h2>
        </div>
        <div className="p-6 space-y-6">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">{f.label}</label>
              <div className="flex items-center gap-2">
                <input type="number" className="w-24 px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values[f.key] ?? ''} onChange={(e) => update(f.key, e.target.value)} />
                {f.unit && <span className="text-xs text-surface-400">{f.unit}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
          <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 system/rate-limits/page.tsx**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

const groups = [
  { title: 'Post Creation', fields: [{ key: 'rate_post_max', label: 'Max posts' }, { key: 'rate_post_window_min', label: 'Time window (min)' }] },
  { title: 'Reply Creation', fields: [{ key: 'rate_reply_max', label: 'Max replies' }, { key: 'rate_reply_window_min', label: 'Time window (min)' }, { key: 'rate_reply_newuser_cooldown_sec', label: 'New user cooldown (sec)' }] },
  { title: 'Login Attempts', fields: [{ key: 'rate_login_max', label: 'Max attempts' }, { key: 'rate_login_lock_min', label: 'Lock duration (min)' }] },
  { title: 'API Requests', fields: [{ key: 'rate_api_max', label: 'Requests per min' }] },
];

export default function RateLimitsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try { setValues(await adminApi.getSettings('rate_limit')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await adminApi.updateSettings('rate_limit', values); setMessage('Saved'); setTimeout(() => setMessage(null), 3000); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">Rate Limits</h1>
        <p className="text-sm text-surface-500 mt-1">Prevent abuse by controlling action frequency</p>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {groups.map((group) => (
          <div key={group.title} className="bg-surface-50 border border-surface-200 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-4">{group.title}</h3>
            <div className="space-y-3">
              {group.fields.map((f) => (
                <div key={f.key} className="flex justify-between items-center">
                  <span className="text-sm text-surface-600">{f.label}</span>
                  <input type="number" className="w-20 px-2 py-1 border border-surface-200 rounded text-sm text-center font-mono focus:outline-none focus:border-surface-400" value={values[f.key] ?? ''} onChange={(e) => update(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save All'}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 system/bans/page.tsx**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import type { AdminBan, CreateBanInput } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function BansPage() {
  const [bans, setBans] = useState<AdminBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateBanInput>({ ban_type: 'ip', value: '', reason: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBans = useCallback(async () => {
    try {
      const res = await adminApi.getBans();
      setBans(res.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBans(); }, [fetchBans]);

  const handleCreate = async () => {
    if (!form.value.trim()) return;
    try {
      await adminApi.createBan(form);
      setForm({ ban_type: 'ip', value: '', reason: '' });
      setShowForm(false); setMessage('Ban added'); fetchBans();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleDeactivate = async (id: number) => {
    try { await adminApi.deactivateBan(id); setMessage('Ban removed'); fetchBans(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">Ban Management</h1>
          <p className="text-sm text-surface-500 mt-1">Block specific IP addresses or users</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>New Ban</Button>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {showForm && (
        <div className="bg-white border border-surface-200 p-4 flex gap-2 items-end">
          <div>
            <label className="block text-xs text-surface-500 mb-1">Type</label>
            <select className="px-3 py-2 border border-surface-200 rounded text-sm" value={form.ban_type} onChange={(e) => setForm({ ...form, ban_type: e.target.value as any })}>
              <option value="ip">IP</option>
              <option value="ip_range">IP Range</option>
              <option value="user">User</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-surface-500 mb-1">Value</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm font-mono" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="IP or user ID" />
          </div>
          <div>
            <label className="block text-xs text-surface-500 mb-1">Reason</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason" />
          </div>
          <Button onClick={handleCreate}>Add</Button>
          <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
        </div>
      )}

      <div className="bg-white border border-surface-200 overflow-hidden">
        {bans.length === 0 ? (
          <div className="p-8 text-center text-surface-400">No bans</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Value</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Reason</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">By</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bans.map((ban) => (
                <tr key={ban.id} className="border-b border-surface-100 last:border-b-0 hover:bg-surface-50">
                  <td className="px-4 py-3"><span className="text-xs bg-surface-100 text-surface-500 px-2 py-0.5 rounded uppercase font-semibold">{ban.ban_type}</span></td>
                  <td className="px-4 py-3 font-mono text-sm">{ban.value}</td>
                  <td className="px-4 py-3 text-surface-600">{ban.reason || '—'}</td>
                  <td className="px-4 py-3 text-surface-500">{ban.creator_name || '—'}</td>
                  <td className="px-4 py-3 text-surface-500 font-mono text-xs">{new Date(ban.created_at).toLocaleDateString('zh-CN')}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded font-semibold ${ban.is_active ? 'bg-surface-100 text-surface-600' : 'bg-surface-50 text-surface-400'}`}>{ban.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-4 py-3"><Button variant="danger" size="sm" onClick={() => handleDeactivate(ban.id)}>Remove</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 system/cleanup/page.tsx**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function CleanupPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try { setValues(await adminApi.getSettings('cleanup')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await adminApi.updateSettings('cleanup', values); setMessage('Saved'); setTimeout(() => setMessage(null), 3000); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  const runCleanup = async (endpoint: string) => {
    try {
      const result = await (adminApi as any)[endpoint]();
      setMessage(result.message);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">Data Cleanup</h1>
        <p className="text-sm text-surface-500 mt-1">Automated rules and manual tools for database maintenance</p>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {/* Auto cleanup rules */}
      <div className="bg-white border border-surface-200">
        <div className="px-6 py-4 border-b border-surface-200">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">Auto Cleanup Rules</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface-50 border border-surface-200 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-4">Audit Logs</h3>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-surface-600">Retention days</span>
              <input type="number" className="w-20 px-2 py-1 border border-surface-200 rounded text-sm text-center font-mono" value={values.cleanup_log_retention_days ?? '90'} onChange={(e) => update('cleanup_log_retention_days', e.target.value)} />
            </div>
            <p className="text-xs text-surface-400">Delete oldest when exceeding limit</p>
          </div>

          <div className="bg-surface-50 border border-surface-200 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-4">Soft Deleted</h3>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-surface-600">Retention days</span>
              <input type="number" className="w-20 px-2 py-1 border border-surface-200 rounded text-sm text-center font-mono" value={values.cleanup_soft_delete_retention_days ?? '30'} onChange={(e) => update('cleanup_soft_delete_retention_days', e.target.value)} />
            </div>
            <p className="text-xs text-surface-400">Permanent delete after retention</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-surface-200 flex justify-end gap-2">
          <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>

      {/* Manual cleanup */}
      <div className="bg-white border border-surface-200">
        <div className="px-6 py-4 border-b border-surface-200">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">Manual Cleanup</h2>
        </div>
        <div className="p-6 flex gap-3 flex-wrap">
          <Button variant="danger" onClick={() => runCleanup('cleanupSessions')}>Clear Expired Sessions</Button>
          <Button variant="danger" onClick={() => runCleanup('cleanupLogs')}>Clear Old Logs</Button>
          <Button variant="danger" onClick={() => runCleanup('cleanupSoftDeleted')}>Purge Soft Deleted</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/system/
git commit -m "feat(frontend): add 4 system config pages (rules, rate-limits, bans, cleanup)"
```

---

## Task 13: 更新现有页面 + 验证

**Files:**
- Modify: `frontend/src/app/admin/posts/page.tsx`
- Modify: `frontend/src/app/admin/users/page.tsx`

- [ ] **Step 1: 修改 posts/page.tsx 增加批量操作**

在现有页面顶部工具栏（h1 下方）增加选择框和批量操作按钮。主要变更：
1. 在表头加 checkbox 列
2. 在每行加 checkbox
3. 增加 `selectedIds` state
4. 增加批量操作 handler

在 `export default function AdminPostsPage()` 中，在 `const [actionInProgress...]` 后面添加：

```typescript
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === posts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(posts.map(p => p.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected posts?`)) return;
    setBulkActionLoading(true);
    try {
      await adminApi.bulkDeletePosts(selectedIds);
      setSelectedIds([]);
      showActionSuccess(`${selectedIds.length} posts deleted`);
      await fetchPosts(currentPage);
    } catch (err) { showActionError(err instanceof Error ? err.message : 'Failed'); }
    finally { setBulkActionLoading(false); }
  };

  const handleBulkPin = async (isPinned: boolean) => {
    if (!selectedIds.length) return;
    setBulkActionLoading(true);
    try {
      await adminApi.bulkPinPosts(selectedIds, isPinned);
      showActionSuccess(`${selectedIds.length} posts ${isPinned ? 'pinned' : 'unpinned'}`);
      await fetchPosts(currentPage);
    } catch (err) { showActionError(err instanceof Error ? err.message : 'Failed'); }
    finally { setBulkActionLoading(false); }
  };
```

在 h1 标题后面（flex div 内）增加批量操作按钮，仅在 selectedIds.length > 0 时显示。

在 table 的 thead 第一列位置添加全选 checkbox，在每行第一列位置添加行 checkbox。

- [ ] **Step 2: 修改 users/page.tsx 增加搜索**

在 h1 标题下方添加搜索框：

```tsx
const [search, setSearch] = useState('');
const [searchQuery, setSearchQuery] = useState('');

// 修改 fetchUsers 使用 searchQuery 参数
const fetchUsers = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await adminApi.getUsers({ page, limit: PAGE_SIZE, search: searchQuery || undefined });
      setUsers(res.data); setTotalPages(res.pagination.totalPages);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load users'); }
    finally { setLoading(false); }
  }, [page, searchQuery]);

// 搜索按钮 handler
const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setSearchQuery(search); setPage(1); };

// 在 h1 下方添加:
<form onSubmit={handleSearch} className="flex gap-2 mt-4">
  <input className="px-3 py-2 border border-surface-200 rounded text-sm w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by username or email..." />
  <Button type="submit" size="sm">Search</Button>
</form>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/admin/posts/page.tsx frontend/src/app/admin/users/page.tsx
git commit -m "feat(frontend): add bulk operations to posts page + search to users page"
```

---

## Task 14: 自审与验证

- [ ] **Step 1: 后端启动验证**

```bash
npm run dev
```

在另一个终端：

```bash
curl -s http://localhost:4000/api/admin/stats | head -c 200
```

Expected: `{"success":true,"data":{"total_posts":...`

- [ ] **Step 2: 前端启动验证**

```bash
cd frontend && npm run dev
```

访问 `http://localhost:3000/admin`，以 admin 身份登录，确认：
- Dashboard 显示真实数据
- 侧边栏显示所有新导航项
- Settings 页面能加载和保存
- Tags 页面能创建/删除
- Bans 页面能添加/移除
- Cleanup 页面能执行清理

- [ ] **Step 3: 提交最终 commit**

```bash
git add -A
git status  # 确认没有敏感文件
git commit -m "feat: complete admin panel overhaul with settings, content management, and system config"
```

---

## 执行顺序与依赖关系

```
Task 1 (DB schema)
    ↓
Task 2 (SettingService)
    ↓
Task 3 (StatService + BanService)
    ↓
Task 4 (Middleware)          Task 5 (UserService search + constants)
    ↓                             ↓
Task 6 (Admin controller) ←─────┘
    ↓
Task 7 (Admin routes + seed defaults)
    ↓
Task 8 (Types + API client)
    ↓
Task 9 (Sidebar + Dashboard)
    ↓
Task 10 (Settings pages)    Task 11 (Content pages)    Task 12 (System pages)
    ↓                             ↓                           ↓
                    Task 13 (Existing pages update)
                            ↓
                    Task 14 (Final verification)
```

每个 task 产出可独立验证的 commit。Task 10/11/12 可以并行执行。
