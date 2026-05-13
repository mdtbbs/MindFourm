# MindForum Performance Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 8 highest-impact performance issues so the backend runs fast now and scales to 10k+ posts and 100+ concurrent users without degrading.

**Architecture:** All optimizations are backend-only (Koa + better-sqlite3). No new dependencies except `koa-compress`. Changes are surgical: add indexes, batch queries, cache in memory, strip unnecessary response fields.

**Tech Stack:** Koa, better-sqlite3, Node.js, Next.js 14 (frontend read-only changes)

---

### Task 1: Add missing database indexes

**Files:**
- Modify: `src/database/schema.sql`

- [ ] **Step 1: Add composite and missing indexes to schema**

Append these to the existing index block in `src/database/schema.sql` (after line 152):

```sql
-- Composite index for main post listing query (filter + sort)
CREATE INDEX IF NOT EXISTS idx_posts_list ON posts(deleted_at, status, is_pinned DESC, created_at DESC);

-- Composite index for reply listing with deleted_at filter
CREATE INDEX IF NOT EXISTS idx_replies_list ON replies(post_id, deleted_at, created_at ASC);

-- Indexes for user search (username/email LIKE)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Composite index for ban lookups
CREATE INDEX IF NOT EXISTS idx_bans_lookup ON bans(ban_type, value, is_active);

-- Composite index for log listing
CREATE INDEX IF NOT EXISTS idx_logs_list ON operation_logs(created_at DESC, user_id, action);

-- Composite index for session validation
CREATE INDEX IF NOT EXISTS idx_sessions_validate ON sessions(session_token, expires_at);

-- Composite index for post_tags lookups
CREATE INDEX IF NOT EXISTS idx_post_tags_post ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag_id);
```

- [ ] **Step 2: Commit**

```bash
git add src/database/schema.sql
git commit -m "perf: add missing indexes for post listing, replies, user search, ban/lookups, logs, sessions"
```

---

### Task 2: Install koa-compress and add response compression

**Files:**
- Modify: `package.json`
- Modify: `src/app.js`

- [ ] **Step 1: Install koa-compress**

Run: `npm install koa-compress` in `G:\MindProject\MindFourm`

Expected: `added 1 package`

- [ ] **Step 2: Add compression middleware to app.js**

```javascript
// Add at top of src/app.js, after line 3:
const compress = require('koa-compress');

// Add after line 10 (app.proxy = true;):
app.use(compress({
  gzip: { threshold: 1024 },
  deflate: { threshold: 1024 }
}));
```

Full updated `src/app.js`:

```javascript
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const compress = require('koa-compress');
const { errorHandler } = require('./middleware/error');
const routes = require('./routes');
const config = require('./config');

const app = new Koa();

app.proxy = true;

app.use(compress({
  gzip: { threshold: 1024 },
  deflate: { threshold: 1024 }
}));

app.use(errorHandler);

app.use(cors({
  origin: config.app.env === 'development' ? '*' : config.app.baseUrl,
  credentials: true
}));

app.use(bodyParser({
  json: { limit: '1mb' }
}));

app.use(routes.routes());
app.use(routes.allowedMethods());

app.use((ctx) => {
  ctx.status = 404;
  ctx.body = { success: false, message: 'Not found' };
});

module.exports = app;
```

Note: Also reduce body parser limit from `10mb` to `1mb` — forum posts are <10KB.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/app.js
git commit -m "perf: add response compression and reduce body parser limit"
```

---

### Task 3: Batch tag fetching to eliminate N+1 queries

**Files:**
- Modify: `src/services/post.service.js`
- Modify: `src/services/tag.service.js`

- [ ] **Step 1: Add batch methods to TagService**

Add these methods to `src/services/tag.service.js` (after `getPostTags`, before `getPostsByTagSlug`):

```javascript
  static getPostTagsForMultiplePosts(postIds) {
    if (!postIds.length) return {};
    const rows = db.prepare(`
      SELECT pt.post_id, t.*
      FROM post_tags pt
      JOIN tags t ON pt.tag_id = t.id
      WHERE pt.post_id IN (${postIds.map(() => '?').join(',')})
      ORDER BY pt.post_id
    `).all(...postIds);

    const map = {};
    for (const row of rows) {
      if (!map[row.post_id]) map[row.post_id] = [];
      map[row.post_id].push(row);
    }
    return map;
  }
```

- [ ] **Step 2: Add batch attach method to TagService**

Add after `attachTags`:

```javascript
  static batchAttach(postId, tags) {
    if (!tags || !tags.length) return;
    const existing = db.prepare(`SELECT name, id FROM tags WHERE name IN (${tags.map(() => '?').join(',')})`).all(...tags);
    const existingMap = {};
    for (const t of existing) existingMap[t.name] = t.id;

    const missing = tags.filter(t => !existingMap[t]);
    const toCreate = [];
    for (const name of missing) {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      toCreate.push([name, slug]);
    }

    if (toCreate.length) {
      const bulkInsert = db.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)');
      db.transaction(() => {
        for (const [name, slug] of toCreate) bulkInsert.run(name, slug);
      })();
      // Re-fetch newly created tags
      const newRows = db.prepare(`SELECT name, id FROM tags WHERE name IN (${missing.map(() => '?').join(',')})`).all(...missing);
      for (const t of newRows) existingMap[t.name] = t.id;
    }

    // Bulk insert post_tags
    const postTagRows = [];
    for (const name of tags) {
      const tagId = existingMap[name];
      if (tagId !== undefined) postTagRows.push([postId, tagId]);
    }
    if (postTagRows.length) {
      const bulkTag = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)');
      db.transaction(() => {
        for (const [pid, tid] of postTagRows) bulkTag.run(pid, tid);
      })();
    }
  }
```

- [ ] **Step 3: Update TagService.attachTags to use batch method**

Replace the existing `attachTags` method:

```javascript
  static attachTags(postId, tags) {
    this.batchAttach(postId, tags);
  }
```

- [ ] **Step 4: Update PostService.getList to batch-fetch tags**

Replace the `getList` method in `src/services/post.service.js`:

```javascript
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

    // Batch-fetch tags for all posts in one query
    if (posts.length > 0) {
      const tagMap = TagService.getPostTagsForMultiplePosts(posts.map(p => p.id));
      for (const post of posts) {
        post.tags = tagMap[post.id] || [];
      }
    }

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
```

- [ ] **Step 5: Commit**

```bash
git add src/services/post.service.js src/services/tag.service.js
git commit -m "perf: batch tag fetching to eliminate N+1 queries in post listing and tag attachment"
```

---

### Task 4: Exclude content_html from post listing responses

**Files:**
- Modify: `src/controllers/post.controller.js`

- [ ] **Step 1: Strip content_html from list response**

Update the `list` method in `src/controllers/post.controller.js`:

```javascript
  static list(ctx) {
    const { page, limit, category_id, status, user_id } = ctx.query;

    const result = PostService.getList({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      category_id: parseInt(category_id) || null,
      status: status || 'published',
      user_id: parseInt(user_id) || null
    });

    // Strip content_html to reduce payload size
    const trimmed = result.data.map(p => {
      const { content_html, ...rest } = p;
      return rest;
    });

    Response.paginated(ctx, trimmed, result.pagination);
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/controllers/post.controller.js
git commit -m "perf: strip content_html from post listing API to reduce payload size"
```

---

### Task 5: Fix frontend double-fetch for post replies

**Files:**
- Modify: `frontend/src/app/(public)/posts/[id]/page.tsx`

- [ ] **Step 1: Use backend replies instead of separate fetch**

The backend `getById` already returns `{ ...post, replies: [...], repliesPagination: {...} }`. Update the frontend to use it.

Replace the `fetchPost` function to return the full response:

```typescript
async function fetchPost(id: number): Promise<Post & { replies?: any[]; repliesPagination?: any } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/posts/${id}`, { next: { tags: [`post-${id}`] } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}
```

Remove the `fetchReplies` function entirely (it's no longer needed).

Update the page component to remove `fetchReplies` from Promise.all and use post.replies:

```typescript
export default async function PostDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string };
}) {
  const postId = parseInt(params.id);
  const page = parseInt(searchParams.page || '1');

  const settings = await fetchSettings();
  const repliesPerPage = parseInt(settings?.replies_per_page || '50');

  // Use the full post response which already includes replies
  const data = await fetch(`${API_BASE}/api/v1/posts/${postId}?page=${page}&limit=${repliesPerPage}`, { next: { tags: [`post-${postId}`] } });
  const json = await data.json();
  const post = json.success ? json.data : null;

  if (!post) {
    return notFound();
  }

  const repliesResult = {
    data: post.replies || [],
    pagination: post.repliesPagination || { page: 1, limit: repliesPerPage, total: 0, totalPages: 1 },
  };
  const categories = post.categories || [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-surface-500">
        <Link href="/" className="hover:text-primary-600">首页</Link>
        <span className="mx-2">/</span>
        {post.category_name ? (
          <>
            <Link href={`/categories/${post.category_id}`} className="hover:text-primary-600">
              {post.category_name}
            </Link>
            <span className="mx-2">/</span>
          </>
        ) : null}
        <span className="text-surface-900">{post.title}</span>
      </nav>

      {/* Post Content */}
      <PostContent post={post} />

      {/* Replies */}
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-surface-900">
          回复 ({repliesResult.pagination.total})
        </h2>

        {repliesResult.data.length === 0 ? (
          <div className="text-center py-8 text-surface-500">暂无回复</div>
        ) : (
          <div className="space-y-4">
            {repliesResult.data.map((reply: any, index: number) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                index={(page - 1) * repliesPerPage + index}
              />
            ))}
          </div>
        )}

        <Pagination
          currentPage={repliesResult.pagination.page}
          totalPages={repliesResult.pagination.totalPages}
          basePath={`/posts/${postId}`}
        />
      </div>
    </div>
  );
}
```

Also remove the unused imports: `categoryApi`, `ReplyListResponse`, and the `fetchCategories` / `fetchReplies` functions.

Full cleaned-up file:

```typescript
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import PostContent from '@/components/forum/post-content';
import ReplyItem from '@/components/forum/reply-item';
import Pagination from '@/components/ui/pagination';
import Link from 'next/link';
import { Post } from '@/types';

export const revalidate = 60;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchSettings(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_BASE}/api/settings`, { next: { revalidate: 60 } });
    if (!res.ok) return {};
    const json = await res.json();
    return json.success ? json.data : {};
  } catch {
    return {};
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const res = await fetch(`${API_BASE}/api/v1/posts/${params.id}`, { next: { tags: [`post-${params.id}`] } });
  if (!res.ok) return { title: 'Not Found' };
  const json = await res.json();
  const post = json.success ? json.data : null;
  if (!post) return { title: 'Not Found' };

  const settings = await fetchSettings();
  const titleSuffix = settings.seo_title_suffix || ' | MindForum';
  const meta: Metadata = {
    title: `${post.title}${titleSuffix}`,
    description: post.content.slice(0, 160),
    openGraph: {
      title: `${post.title}${titleSuffix}`,
      description: post.content.slice(0, 160),
      type: 'article',
    },
  };
  if (settings.seo_og_image) {
    meta.openGraph = { ...meta.openGraph, images: [settings.seo_og_image] };
  }
  return meta;
}

export default async function PostDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string };
}) {
  const postId = parseInt(params.id);
  const page = parseInt(searchParams.page || '1');

  const settings = await fetchSettings();
  const repliesPerPage = parseInt(settings?.replies_per_page || '50');

  const res = await fetch(`${API_BASE}/api/v1/posts/${postId}?page=${page}&limit=${repliesPerPage}`, { next: { tags: [`post-${postId}`] } });
  if (!res.ok) return notFound();
  const json = await res.json();
  if (!json.success) return notFound();

  const post = json.data;
  const repliesResult = {
    data: post.replies || [],
    pagination: post.repliesPagination || { page: 1, limit: repliesPerPage, total: 0, totalPages: 1 },
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-surface-500">
        <Link href="/" className="hover:text-primary-600">首页</Link>
        <span className="mx-2">/</span>
        {post.category_name ? (
          <>
            <Link href={`/categories/${post.category_id}`} className="hover:text-primary-600">
              {post.category_name}
            </Link>
            <span className="mx-2">/</span>
          </>
        ) : null}
        <span className="text-surface-900">{post.title}</span>
      </nav>

      {/* Post Content */}
      <PostContent post={post} />

      {/* Replies */}
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-surface-900">
          回复 ({repliesResult.pagination.total})
        </h2>

        {repliesResult.data.length === 0 ? (
          <div className="text-center py-8 text-surface-500">暂无回复</div>
        ) : (
          <div className="space-y-4">
            {repliesResult.data.map((reply: any, index: number) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                index={(page - 1) * repliesPerPage + index}
              />
            ))}
          </div>
        )}

        <Pagination
          currentPage={repliesResult.pagination.page}
          totalPages={repliesResult.pagination.totalPages}
          basePath={`/posts/${postId}`}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/\(public\)/posts/\[id\]/page.tsx
git commit -m "perf: eliminate double-fetch for post replies by using backend's embedded response"
```

---

### Task 6: Add in-memory ban cache

**Files:**
- Create: `src/services/ban-cache.js`
- Modify: `src/middleware/ban-check.js`
- Modify: `src/routes/admin.routes.js`

- [ ] **Step 1: Create in-memory ban cache**

Create `src/services/ban-cache.js`:

```javascript
const db = require('../database');

let activeBans = null;
let lastRefresh = 0;
const REFRESH_INTERVAL = 10000; // 10 seconds

function loadBans() {
  const bans = db.prepare("SELECT ban_type, value FROM bans WHERE is_active = 1").all();
  activeBans = {
    ips: new Set(),
    ipRanges: [],
    users: new Set(),
  };
  for (const ban of bans) {
    if (ban.ban_type === 'ip') activeBans.ips.add(ban.value);
    else if (ban.ban_type === 'ip_range') activeBans.ipRanges.push(ban.value);
    else if (ban.ban_type === 'user') activeBans.users.add(ban.value);
  }
  lastRefresh = Date.now();
}

function ensureFresh() {
  if (!activeBans || Date.now() - lastRefresh > REFRESH_INTERVAL) {
    loadBans();
  }
}

function ipInRange(ip, cidr) {
  if (!cidr.includes('/')) return ip === cidr;
  const [base, bits] = cidr.split('/');
  const mask = ~((1 << (32 - parseInt(bits))) - 1);
  const ipNum = ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  const baseNum = base.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

module.exports = {
  checkIp(ip) {
    ensureFresh();
    if (activeBans.ips.has(ip)) return true;
    for (const cidr of activeBans.ipRanges) {
      if (ipInRange(ip, cidr)) return true;
    }
    return false;
  },

  isUserBanned(userId) {
    ensureFresh();
    return activeBans.users.has(String(userId));
  },

  invalidate() {
    lastRefresh = 0; // Force refresh on next check
  }
};
```

- [ ] **Step 2: Update ban-check middleware to use cache**

Replace `src/middleware/ban-check.js`:

```javascript
const Response = require('../utils/response');
const BanCache = require('../services/ban-cache');

const banCheck = async (ctx, next) => {
  const ip = ctx.ip;

  if (BanCache.checkIp(ip)) {
    return Response.error(ctx, 'Access denied', 403, 'BANNED');
  }

  if (ctx.state.user) {
    if (BanCache.isUserBanned(ctx.state.user.id)) {
      return Response.error(ctx, 'Account banned', 403, 'BANNED');
    }
  }

  return next();
};

module.exports = banCheck;
```

- [ ] **Step 3: Invalidate ban cache when bans are created/updated/deleted**

Add cache invalidation calls to admin routes. Modify `src/routes/admin.routes.js` — add the cache import and wrap ban routes:

Add at top of file (after line 5):
```javascript
const BanCache = require('../services/ban-cache');
```

Wrap the ban mutation routes. After the existing route definitions for bans (lines 49-52), add cache invalidation by modifying the routes to use inline middleware:

```javascript
// After line 49:
const invalidateBanCache = (ctx, next) => {
  BanCache.invalidate();
  return next();
};

router.get('/bans', authMiddleware({ required: true }), requireAdmin, invalidateBanCache, AdminController.getBans);
router.post('/bans', authMiddleware({ required: true }), requireAdmin, validate, AdminController.createBan);
router.put('/bans/:id', authMiddleware({ required: true }), requireAdmin, AdminController.updateBan);
router.delete('/bans/:id', authMiddleware({ required: true }), requireAdmin, AdminController.deactivateBan);
```

Actually, simpler: just invalidate inside the controller methods. Add to `AdminController.createBan`, `AdminController.updateBan`, and `AdminController.deactivateBan`:

Add this import to `src/controllers/admin.controller.js`:
```javascript
const BanCache = require('../services/ban-cache');
```

Add `BanCache.invalidate()` after the DB operations in:

```javascript
// In createBan, after line 276:
BanCache.invalidate();

// In updateBan, after line 283:
BanCache.invalidate();

// In deactivateBan, after line 292:
BanCache.invalidate();
```

Full updated `src/controllers/admin.controller.js` — only these three lines change:

In `createBan` (after `Response.created(ctx, ban);` line):
```javascript
BanCache.invalidate();
```

Actually, the invalidation should happen BEFORE the response is sent, right after the DB operation. Let me be precise:

In `createBan`, add after `const ban = BanService.create(...)`:
```javascript
BanCache.invalidate();
```

In `updateBan`, add after `const ban = BanService.update(...)`:
```javascript
BanCache.invalidate();
```

In `deactivateBan`, add after `const ban = BanService.deactivate(...)`:
```javascript
BanCache.invalidate();
```

- [ ] **Step 4: Commit**

```bash
git add src/services/ban-cache.js src/middleware/ban-check.js src/controllers/admin.controller.js src/routes/admin.routes.js
git commit -m "perf: add in-memory ban cache with 10s TTL to eliminate per-request DB queries"
```

---

### Task 7: Remove per-write log cleanup, add scheduled cleanup endpoint

**Files:**
- Modify: `src/services/log.service.js`
- Modify: `src/controllers/admin.controller.js`

- [ ] **Step 1: Remove auto-cleanup from LogService.log**

In `src/services/log.service.js`, remove lines 19-23 (the COUNT + DELETE block):

```javascript
  static log({ user_id, action, target_type, target_id, details, ip_address, user_agent }) {
    db.prepare(`
      INSERT INTO operation_logs (user_id, action, target_type, target_id, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      user_id || null,
      action,
      target_type || null,
      target_id || null,
      details ? JSON.stringify(details) : null,
      ip_address || null,
      user_agent || null
    );
  }
```

The COUNT(*) and DELETE are gone. Cleanup is now only via admin endpoint.

- [ ] **Step 2: Update admin cleanupLogs to use settings-based retention**

The `cleanupLogs` method in `AdminController` already reads `cleanup_log_retention_days` from settings. It's correct as-is. No change needed.

- [ ] **Step 3: Commit**

```bash
git add src/services/log.service.js
git commit -m "perf: remove per-write log cleanup — logs are now cleaned only via admin endpoint using settings"
```

---

### Task 8: Add Cache-Control headers for static-like API endpoints

**Files:**
- Modify: `src/routes/category.routes.js`
- Modify: `src/routes/tag.routes.js`
- Modify: `src/routes/index.js`

- [ ] **Step 1: Add Cache-Control middleware for public read-only endpoints**

Create a simple middleware. In `src/routes/index.js`, add after the public settings route:

```javascript
// Cache-Control for static-like public endpoints
router.get('/api/categories', async (ctx, next) => {
  await next();
  if (ctx.status === 200) {
    ctx.set('Cache-Control', 'public, max-age=60');
  }
});
router.get('/api/tags', async (ctx, next) => {
  await next();
  if (ctx.status === 200) {
    ctx.set('Cache-Control', 'public, max-age=60');
  }
});
router.get('/api/settings', async (ctx, next) => {
  await next();
  if (ctx.status === 200) {
    ctx.set('Cache-Control', 'public, max-age=30');
  }
});
```

Wait — the legacy routes already register `/api/categories` and `/api/tags` via `categoryRoutes` and `tagRoutes`. The `/api/settings` route is already defined. Adding `router.get` before `router.use(...routes())` will work because Koa matches routes in order.

But a cleaner approach: add a post-route middleware that sets Cache-Control for specific paths. Update `src/app.js`:

Add after `app.use(routes.allowedMethods());`:

```javascript
// Cache-Control for static-like API responses
app.use(async (ctx, next) => {
  await next();
  if (ctx.status === 200) {
    if (ctx.path === '/api/categories' || ctx.path === '/api/tags') {
      ctx.set('Cache-Control', 'public, max-age=60');
    } else if (ctx.path === '/api/settings') {
      ctx.set('Cache-Control', 'public, max-age=30');
    }
  }
});
```

Add this to `src/app.js` after line 23 (`app.use(routes.allowedMethods());`):

```javascript
app.use(async (ctx) => {
  // This won't work — it's a terminal middleware. Need to use the pattern above.
});
```

Actually, the correct pattern is to add it as a middleware BEFORE the 404 handler. Update `src/app.js`:

```javascript
app.use(routes.routes());
app.use(routes.allowedMethods());

// Cache-Control for static-like API responses
app.use(async (ctx, next) => {
  await next();
  if (ctx.status === 200) {
    if (ctx.path === '/api/categories' || ctx.path === '/api/tags') {
      ctx.set('Cache-Control', 'public, max-age=60');
    } else if (ctx.path === '/api/settings') {
      ctx.set('Cache-Control', 'public, max-age=30');
    }
  }
});

app.use((ctx) => {
  ctx.status = 404;
  ctx.body = { success: false, message: 'Not found' };
});
```

This works because the Cache-Control middleware calls `await next()` first (letting all routes run), then sets headers on the response on the way back up the stack.

Full updated `src/app.js`:

```javascript
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const compress = require('koa-compress');
const { errorHandler } = require('./middleware/error');
const routes = require('./routes');
const config = require('./config');

const app = new Koa();

app.proxy = true;

app.use(compress({
  gzip: { threshold: 1024 },
  deflate: { threshold: 1024 }
}));

app.use(errorHandler);

app.use(cors({
  origin: config.app.env === 'development' ? '*' : config.app.baseUrl,
  credentials: true
}));

app.use(bodyParser({
  json: { limit: '1mb' }
}));

app.use(routes.routes());
app.use(routes.allowedMethods());

// Cache-Control for static-like API responses
app.use(async (ctx, next) => {
  await next();
  if (ctx.status === 200) {
    if (ctx.path === '/api/categories' || ctx.path === '/api/tags') {
      ctx.set('Cache-Control', 'public, max-age=60');
    } else if (ctx.path === '/api/settings') {
      ctx.set('Cache-Control', 'public, max-age=30');
    }
  }
});

app.use((ctx) => {
  ctx.status = 404;
  ctx.body = { success: false, message: 'Not found' };
});

module.exports = app;
```

- [ ] **Step 2: Commit**

```bash
git add src/app.js
git commit -m "perf: add Cache-Control headers for categories, tags, and settings API endpoints"
```

---

## Self-Review

### 1. Spec coverage

| Issue from audit | Task |
|------------------|------|
| Missing indexes (6 gaps) | Task 1 — adds 8 new indexes |
| No response compression | Task 2 — installs koa-compress |
| N+1 queries (post listing, tag attachment) | Task 3 — batch tag fetching + batch attach |
| Oversized API responses (content_html in list) | Task 4 — strips content_html |
| Frontend double-fetch replies | Task 5 — uses embedded backend response |
| Per-request DB for ban check | Task 6 — in-memory cache with 10s TTL |
| Per-write log cleanup | Task 7 — removes COUNT+DELETE from write path |
| No Cache-Control headers | Task 8 — adds Cache-Control for static endpoints |
| Body parser 10mb limit | Task 2 — reduced to 1mb |

All 8 priority areas covered.

### 2. Placeholder scan

No "TBD", "TODO", or incomplete sections found. All code blocks are complete.

### 3. Type consistency

- `BanCache` exports `checkIp()`, `isUserBanned()`, `invalidate()` — used consistently in middleware and controllers
- `TagService.getPostTagsForMultiplePosts()` returns `{ postId: [tag, ...] }` — matches how `PostService.getList` consumes it
- `TagService.batchAttach()` signature matches existing `attachTags()` caller in `PostService.create()`
- Frontend `Post` type is extended with optional `replies` and `repliesPagination` — no type conflict since we cast to `any` for replies

### 4. Order dependencies

- Task 1 (indexes) is standalone, can run first
- Task 2 (compression) is standalone, can run anytime
- Task 3 (batch tags) depends on nothing — but Task 4 (strip content_html) should come after since it also touches `post.controller.js`
- Task 5 (frontend double-fetch) is standalone
- Task 6 (ban cache) is standalone
- Task 7 (log cleanup) is standalone
- Task 8 (Cache-Control) builds on Task 2's app.js changes

Recommended execution order: 1, 2, 4, 8, 3, 5, 6, 7

---

Plan complete and saved to `docs/superpowers/plans/2026-05-13-mindforum-performance-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
