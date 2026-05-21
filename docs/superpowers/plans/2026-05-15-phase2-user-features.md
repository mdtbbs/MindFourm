# Phase 2: 用户功能补全 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement user profile completion with avatar upload, post bookmarks, and notification database/API — no notification UI yet.

**Architecture:** Backend-first approach. Add database migrations, then create new service/controller/route modules for users, bookmarks, and notifications. Frontend updates existing user profile page, adds profile edit page, and adds bookmark button to post detail page.

**Tech Stack:** Koa (backend), better-sqlite3 (database), Next.js 14 App Router (frontend), TypeScript, lucide-react (icons)

---

### Task 1: Database Migration — users fields, bookmarks table, notifications table

**Files:**
- Modify: `src/database/schema.sql:1-174`
- Modify: `src/database/index.js:25-35` (add migration block)

- [ ] **Step 1: Add migration to schema.sql**

Append these lines at the very end of `src/database/schema.sql`, after line 174:

```sql
-- Phase 2: user profile fields
-- (Migrated via database/index.js to handle existing tables)

-- Phase 2: bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    UNIQUE(user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_post ON bookmarks(post_id);

-- Phase 2: notifications
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    actor_id INTEGER NOT NULL,
    post_id INTEGER,
    reply_id INTEGER,
    content TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
    FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_actor ON notifications(actor_id);
```

- [ ] **Step 2: Add ALTER TABLE migrations in database/index.js**

In `src/database/index.js`, after the existing `ALTER TABLE users ADD COLUMN email TEXT` block (around line 35), add:

```js
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
```

- [ ] **Step 3: Verify migration**

```bash
cd G:\MindProject\MindFourm && node -e "const db = require('./src/database'); db.initialize(); console.log('Migration OK'); process.exit(0)"
```

Expected output: `Database initialized at ...` and `Migration OK`. No errors about duplicate columns.

- [ ] **Step 4: Commit**

```bash
git add src/database/schema.sql src/database/index.js
git commit -m "feat(phase2): add database migration for user fields, bookmarks, notifications"
```

---

### Task 2: User Service and Controller

**Files:**
- Modify: `src/services/user.service.js` (rewrite — add profile methods)
- Create: `src/controllers/user.controller.js`

- [ ] **Step 1: Update UserService**

Replace the entire contents of `src/services/user.service.js`:

```js
const db = require('../database');

class UserService {
  static getById(id) {
    return db.prepare(`
      SELECT u.id, u.mindauth_id, u.username, u.email, u.role, u.avatar_url, u.bio, u.created_at,
             COUNT(DISTINCT p.id) as post_count,
             COUNT(DISTINCT r.id) as reply_count
      FROM users u
      LEFT JOIN posts p ON p.user_id = u.id AND p.deleted_at IS NULL
      LEFT JOIN replies r ON r.user_id = u.id AND r.deleted_at IS NULL
      WHERE u.id = ?
      GROUP BY u.id
    `).get(id);
  }

  static getByMindAuthId(mindauthId) {
    return db.prepare('SELECT * FROM users WHERE mindauth_id = ?').get(mindauthId);
  }

  static updateProfile(id, { username, bio }) {
    const updates = {};
    if (username !== undefined) updates.username = username;
    if (bio !== undefined) updates.bio = bio;

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];

    db.prepare(`UPDATE users SET ${fields} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  static updateAvatar(id, avatarUrl) {
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, id);
    return this.getById(id);
  }

  static removeAvatar(id) {
    db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(id);
    return this.getById(id);
  }

  static getRepliesByUserId(userId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;

    const replies = db.prepare(`
      SELECT r.*, u.mindauth_id as author_mindauth_id, u.role as author_role,
             p.title as post_title
      FROM replies r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN posts p ON r.post_id = p.id
      WHERE r.user_id = ? AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM replies
      WHERE user_id = ? AND deleted_at IS NULL
    `).get(userId);

    return {
      data: replies,
      pagination: {
        page, limit, total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  static updateRole(id, role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    return this.getById(id);
  }

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
}

module.exports = UserService;
```

- [ ] **Step 2: Create UserController**

Create `src/controllers/user.controller.js`:

```js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');
const Response = require('../utils/response');
const UserService = require('../services/user.service');

class UserController {
  static getById(ctx) {
    const user = UserService.getById(parseInt(ctx.params.id));
    if (!user) {
      Response.notFound(ctx, 'User not found');
      return;
    }
    Response.success(ctx, user);
  }

  static getMyProfile(ctx) {
    const user = UserService.getById(ctx.state.user.id);
    if (!user) {
      Response.notFound(ctx, 'User not found');
      return;
    }
    Response.success(ctx, user);
  }

  static updateProfile(ctx) {
    const { username, bio } = ctx.request.body;
    const updates = {};
    if (username !== undefined) updates.username = username.trim().slice(0, 30);
    if (bio !== undefined) updates.bio = bio.trim().slice(0, 500);

    if (Object.keys(updates).length === 0) {
      Response.error(ctx, 'No valid fields to update', 400);
      return;
    }

    const user = UserService.updateProfile(ctx.state.user.id, updates);
    Response.success(ctx, user);
  }

  static uploadAvatar(ctx) {
    const file = ctx.request.files?.avatar;
    if (!file) {
      Response.error(ctx, 'No avatar file provided', 400);
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      Response.error(ctx, 'Only JPEG, PNG, GIF, and WebP images are allowed', 400);
      return;
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (Array.isArray(file)) {
      if (file[0].size > maxSize) {
        Response.error(ctx, 'Avatar must be smaller than 2MB', 400);
        return;
      }
    } else {
      if (file.size > maxSize) {
        Response.error(ctx, 'Avatar must be smaller than 2MB', 400);
        return;
      }
    }

    const avatarFile = Array.isArray(file) ? file[0] : file;

    // Create uploads directory
    const uploadsDir = path.join(__dirname, '../../uploads/avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const ext = path.extname(avatarFile.name) || '.jpg';
    const filename = `avatar_${ctx.state.user.id}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    // Move file
    avatarFile.mv(filepath);

    // Update user
    const avatarUrl = `/uploads/avatars/${filename}`;
    const user = UserService.updateAvatar(ctx.state.user.id, avatarUrl);

    Response.success(ctx, { avatar_url: user.avatar_url });
  }

  static removeAvatar(ctx) {
    const user = UserService.getById(ctx.state.user.id);
    if (user?.avatar_url) {
      // Delete file from disk
      const filepath = path.join(__dirname, '../..', user.avatar_url);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }

    UserService.removeAvatar(ctx.state.user.id);
    Response.success(ctx, { message: 'Avatar removed' });
  }

  static getMyReplies(ctx) {
    const { page, limit } = ctx.query;
    const result = UserService.getRepliesByUserId(ctx.state.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    Response.paginated(ctx, result.data, result.pagination);
  }
}

module.exports = UserController;
```

- [ ] **Step 3: Commit**

```bash
git add src/services/user.service.js src/controllers/user.controller.js
git commit -m "feat(phase2): add user service and controller for profile management"
```

---

### Task 3: User Routes + Express File Upload Middleware

**Files:**
- Create: `src/routes/user.routes.js`
- Create: `src/middleware/upload.js`
- Modify: `src/routes/index.js` (register user routes)
- Modify: `src/app.js` or `src/index.js` (add express-file-upload middleware)

- [ ] **Step 1: Create upload middleware**

Create `src/middleware/upload.js`:

```js
const fileUpload = require('express-fileupload');

const avatarUpload = fileUpload({
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  abortOnLimit: true,
  useTempFiles: false,
  safeFileNames: true,
});

module.exports = { avatarUpload };
```

In Task 3, add a public replies endpoint to `src/routes/user.routes.js` after the `getMyReplies` route:

```js
  // Public: get user's replies by user ID
  router.get('/:id/replies', UserController.getRepliesByUserId);
```

And in `src/controllers/user.controller.js`, rename `getMyReplies` to `getRepliesByUserId` and change the user source:

```js
  static getRepliesByUserId(ctx) {
    const { page, limit } = ctx.query;
    const result = UserService.getRepliesByUserId(parseInt(ctx.params.id), {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    Response.paginated(ctx, result.data, result.pagination);
  }
```

Also keep `getMyReplies` as a separate authenticated route that calls the same service method with `ctx.state.user.id`.

Replace `getMyReplies` with both methods in the controller:

```js
  static getMyReplies(ctx) {
    const { page, limit } = ctx.query;
    const result = UserService.getRepliesByUserId(ctx.state.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static getRepliesByUserId(ctx) {
    const { page, limit } = ctx.query;
    const result = UserService.getRepliesByUserId(parseInt(ctx.params.id), {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    Response.paginated(ctx, result.data, result.pagination);
  }
```

- [ ] **Step 2 (corrected): Create user routes**

Create `src/routes/user.routes.js`:

```js
const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const UserController = require('../controllers/user.controller');
const { avatarUpload } = require('../middleware/upload');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/users` });

  // Public: get user profile by ID
  router.get('/:id', UserController.getById);

  // Public: get user's replies
  router.get('/:id/replies', UserController.getRepliesByUserId);

  // Authenticated: my profile
  router.get('/me', authMiddleware({ required: true }), UserController.getMyProfile);

  // Authenticated: update my profile
  router.put('/me/profile', authMiddleware({ required: true }), UserController.updateProfile);

  // Authenticated: upload avatar
  router.post('/me/avatar', authMiddleware({ required: true }), avatarUpload, UserController.uploadAvatar);

  // Authenticated: remove avatar
  router.delete('/me/avatar', authMiddleware({ required: true }), UserController.removeAvatar);

  // Authenticated: my replies
  router.get('/me/replies', authMiddleware({ required: true }), UserController.getMyReplies);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
```

Wait — Koa doesn't support `express-fileupload` natively. We need `koa-body` with multipart support instead. Let me check what's already installed.

- [ ] **Step 2 (corrected): Install koa-body dependency and create upload middleware**

Run this command to check current dependencies:

```bash
cd G:\MindProject\MindFourm && cat package.json | grep -E "(koa-body|formidable|multipart)"
```

Then install koa-body if not present:

```bash
cd G:\MindProject\MindFourm && npm install koa-body
```

Create `src/middleware/upload.js`:

```js
const { koaBody } = require('koa-body');

const avatarUpload = koaBody({
  multipart: true,
  formidable: {
    maxFileSize: 2 * 1024 * 1024, // 2MB
    maxFields: 1,
  },
  parsedMethods: ['POST'],
});

module.exports = { avatarUpload };
```

Create `src/routes/user.routes.js`:

```js
const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const UserController = require('../controllers/user.controller');
const { avatarUpload } = require('../middleware/upload');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/users` });

  // Public: get user profile by ID
  router.get('/:id', UserController.getById);

  // Authenticated: my profile
  router.get('/me', authMiddleware({ required: true }), UserController.getMyProfile);

  // Authenticated: update my profile
  router.put('/me/profile', authMiddleware({ required: true }), UserController.updateProfile);

  // Authenticated: upload avatar
  router.post('/me/avatar', authMiddleware({ required: true }), avatarUpload, UserController.uploadAvatar);

  // Authenticated: remove avatar
  router.delete('/me/avatar', authMiddleware({ required: true }), UserController.removeAvatar);

  // Authenticated: my replies
  router.get('/me/replies', authMiddleware({ required: true }), UserController.getMyReplies);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
```

- [ ] **Step 3: Update UserController uploadAvatar for koa-body**

In `src/controllers/user.controller.js`, update the `uploadAvatar` method. Replace the entire method:

```js
  static uploadAvatar(ctx) {
    const file = ctx.request.files?.avatar;
    if (!file) {
      Response.error(ctx, 'No avatar file provided', 400);
      return;
    }

    // koa-body returns a single File object or undefined
    const avatarFile = Array.isArray(file) ? file[0] : file;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(avatarFile.mimetype)) {
      Response.error(ctx, 'Only JPEG, PNG, GIF, and WebP images are allowed', 400);
      return;
    }

    // Create uploads directory
    const uploadsDir = path.join(__dirname, '../../uploads/avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const ext = path.extname(avatarFile.originalFilename) || '.jpg';
    const filename = `avatar_${ctx.state.user.id}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    // Move file (koa-body uses formidable, file is already in temp)
    fs.renameSync(avatarFile.filepath, filepath);

    // Update user
    const avatarUrl = `/uploads/avatars/${filename}`;
    const user = UserService.updateAvatar(ctx.state.user.id, avatarUrl);

    Response.success(ctx, { avatar_url: user.avatar_url });
  }
```

- [ ] **Step 4: Register user routes in index.js**

In `src/routes/index.js`, add the import and mount. After the existing `createTagRoutes` line:

```js
const userRoutes = require('./user.routes');
const { createRoutes: createUserRoutes } = require('./user.routes');
```

And after the existing `createTagRoutes('/api/v1').routes()` mount:

```js
router.use(createUserRoutes('/api/v1').routes());
```

- [ ] **Step 5: Add static file serving for uploads**

Check the main app entry file (`src/index.js` or `src/app.js`):

```bash
ls G:\MindProject\MindFourm\src\index.js G:\MindProject\MindFourm\src\app.js
```

Read whichever exists, and add static file serving for the uploads directory. Add after the existing `koa-static` mount for the frontend or public folder:

```js
const path = require('path');
// Serve uploaded avatars
app.use(require('koa-static')(path.join(__dirname, '../uploads'), { prefix: '/uploads' }));
```

- [ ] **Step 6: Verify routes work**

```bash
cd G:\MindProject\MindFourm && node -e "const app = require('./src/index'); setTimeout(() => process.exit(0), 2000)"
```

Expected: Server starts without errors on port 4000.

- [ ] **Step 7: Commit**

```bash
git add src/routes/user.routes.js src/middleware/upload.js src/routes/index.js src/controllers/user.controller.js src/index.js
git commit -m "feat(phase2): add user routes with avatar upload support"
```

---

### Task 4: Bookmark Service, Controller, and Routes

**Files:**
- Create: `src/services/bookmark.service.js`
- Create: `src/controllers/bookmark.controller.js`
- Create: `src/routes/bookmark.routes.js`
- Modify: `src/routes/index.js` (register bookmark routes)

- [ ] **Step 1: Create BookmarkService**

Create `src/services/bookmark.service.js`:

```js
const db = require('../database');

class BookmarkService {
  static add(userId, postId) {
    try {
      db.prepare('INSERT INTO bookmarks (user_id, post_id) VALUES (?, ?)').run(userId, postId);
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        return this.getByUserAndPost(userId, postId);
      }
      throw e;
    }
    return this.getByUserAndPost(userId, postId);
  }

  static remove(userId, postId) {
    db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?').run(userId, postId);
  }

  static getByUserAndPost(userId, postId) {
    return db.prepare('SELECT * FROM bookmarks WHERE user_id = ? AND post_id = ?').get(userId, postId);
  }

  static getByUserId(userId, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;

    const bookmarks = db.prepare(`
      SELECT b.id, b.created_at,
             p.id as post_id, p.title, p.status,
             c.name as category_name, c.id as category_id,
             u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM bookmarks b
      JOIN posts p ON b.post_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE b.user_id = ? AND p.deleted_at IS NULL
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM bookmarks b
      JOIN posts p ON b.post_id = p.id
      WHERE b.user_id = ? AND p.deleted_at IS NULL
    `).get(userId);

    return {
      data: bookmarks,
      pagination: {
        page, limit, total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }
}

module.exports = BookmarkService;
```

- [ ] **Step 2: Create BookmarkController**

Create `src/controllers/bookmark.controller.js`:

```js
const Response = require('../utils/response');
const BookmarkService = require('../services/bookmark.service');
const PostService = require('../services/post.service');

class BookmarkController {
  static add(ctx) {
    const postId = parseInt(ctx.params.postId);
    const post = PostService.getById(postId);
    if (!post || post.status !== 'published') {
      Response.notFound(ctx, 'Post not found or not published');
      return;
    }

    const bookmark = BookmarkService.add(ctx.state.user.id, postId);
    Response.created(ctx, bookmark);
  }

  static remove(ctx) {
    BookmarkService.remove(ctx.state.user.id, parseInt(ctx.params.postId));
    Response.success(ctx, { message: 'Bookmark removed' });
  }

  static check(ctx) {
    const bookmark = BookmarkService.getByUserAndPost(ctx.state.user.id, parseInt(ctx.params.postId));
    Response.success(ctx, { bookmarked: !!bookmark });
  }

  static list(ctx) {
    const { page, limit } = ctx.query;
    const result = BookmarkService.getByUserId(ctx.state.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    });
    Response.paginated(ctx, result.data, result.pagination);
  }
}

module.exports = BookmarkController;
```

- [ ] **Step 3: Create bookmark routes**

Create `src/routes/bookmark.routes.js`:

```js
const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const BookmarkController = require('../controllers/bookmark.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/bookmarks` });

  router.get('/', authMiddleware({ required: true }), BookmarkController.list);
  router.get('/check/:postId', authMiddleware({ required: true }), BookmarkController.check);
  router.post('/:postId', authMiddleware({ required: true }), BookmarkController.add);
  router.delete('/:postId', authMiddleware({ required: true }), BookmarkController.remove);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
```

- [ ] **Step 4: Register bookmark routes**

In `src/routes/index.js`, add:

```js
const bookmarkRoutes = require('./bookmark.routes');
const { createRoutes: createBookmarkRoutes } = require('./bookmark.routes');
```

And mount after user routes:

```js
router.use(createBookmarkRoutes('/api/v1').routes());
```

- [ ] **Step 5: Commit**

```bash
git add src/services/bookmark.service.js src/controllers/bookmark.controller.js src/routes/bookmark.routes.js src/routes/index.js
git commit -m "feat(phase2): add bookmark API"
```

---

### Task 5: Notification Service, Controller, and Routes

**Files:**
- Create: `src/services/notification.service.js`
- Create: `src/controllers/notification.controller.js`
- Create: `src/routes/notification.routes.js`
- Modify: `src/services/reply.service.js` (trigger notifications on reply creation)
- Modify: `src/routes/index.js` (register notification routes)
- Modify: `src/utils/constants.js` (add notification action constants)

- [ ] **Step 1: Create NotificationService**

Create `src/services/notification.service.js`:

```js
const db = require('../database');

class NotificationService {
  static create({ user_id, type, actor_id, post_id, reply_id, content }) {
    // Don't notify yourself
    if (user_id === actor_id) return null;

    const result = db.prepare(`
      INSERT INTO notifications (user_id, type, actor_id, post_id, reply_id, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user_id, type, actor_id, post_id, reply_id, content);

    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
  }

  static notifyPostAuthor(postId, { type, actor_id, reply_id, content }) {
    const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
    if (!post) return null;
    return this.create({ user_id: post.user_id, type, actor_id, post_id: postId, reply_id, content });
  }

  static notifyMentionedUsers(content, postId, actorId, replyId) {
    // Extract @username mentions
    const mentions = content.match(/@(\w+)/g);
    if (!mentions) return [];

    const notifications = [];
    for (const mention of mentions) {
      const username = mention.slice(1);
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (user) {
        const notification = this.create({
          user_id: user.id,
          type: 'mention',
          actor_id: actorId,
          post_id: postId,
          reply_id: replyId,
          content: content.slice(0, 200)
        });
        if (notification) notifications.push(notification);
      }
    }
    return notifications;
  }

  static getByUserId(userId, { page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;

    const notifications = db.prepare(`
      SELECT n.*, u.username as actor_name, u.avatar_url as actor_avatar,
             p.title as post_title
      FROM notifications n
      JOIN users u ON n.actor_id = u.id
      LEFT JOIN posts p ON n.post_id = p.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM notifications WHERE user_id = ?
    `).get(userId);

    return {
      data: notifications,
      pagination: {
        page, limit, total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  static getUnreadCount(userId) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND is_read = 0
    `).get(userId).count;
  }

  static markAsRead(notificationId, userId) {
    db.prepare(`
      UPDATE notifications SET is_read = 1
      WHERE id = ? AND user_id = ?
    `).run(notificationId, userId);
  }

  static markAllAsRead(userId) {
    db.prepare(`
      UPDATE notifications SET is_read = 1
      WHERE user_id = ? AND is_read = 0
    `).run(userId);
  }
}

module.exports = NotificationService;
```

- [ ] **Step 2: Create NotificationController**

Create `src/controllers/notification.controller.js`:

```js
const Response = require('../utils/response');
const NotificationService = require('../services/notification.service');

class NotificationController {
  static list(ctx) {
    const { page, limit } = ctx.query;
    const result = NotificationService.getByUserId(ctx.state.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    Response.paginated(ctx, result.data, result.pagination);
  }

  static unreadCount(ctx) {
    const count = NotificationService.getUnreadCount(ctx.state.user.id);
    Response.success(ctx, { count });
  }

  static markAsRead(ctx) {
    NotificationService.markAsRead(parseInt(ctx.params.id), ctx.state.user.id);
    Response.success(ctx, { message: 'Marked as read' });
  }

  static markAllAsRead(ctx) {
    NotificationService.markAllAsRead(ctx.state.user.id);
    Response.success(ctx, { message: 'All marked as read' });
  }
}

module.exports = NotificationController;
```

- [ ] **Step 3: Create notification routes**

Create `src/routes/notification.routes.js`:

```js
const Router = require('@koa/router');
const { authMiddleware } = require('../middleware/auth');
const NotificationController = require('../controllers/notification.controller');

function createRoutes(basePrefix = '/api') {
  const router = new Router({ prefix: `${basePrefix}/notifications` });

  router.get('/', authMiddleware({ required: true }), NotificationController.list);
  router.get('/unread-count', authMiddleware({ required: true }), NotificationController.unreadCount);
  router.put('/:id/read', authMiddleware({ required: true }), NotificationController.markAsRead);
  router.put('/read-all', authMiddleware({ required: true }), NotificationController.markAllAsRead);

  return router;
}

module.exports = createRoutes();
module.exports.createRoutes = createRoutes;
```

- [ ] **Step 4: Wire notifications into ReplyService.create()**

In `src/services/reply.service.js`, at the top add:

```js
const NotificationService = require('./notification.service');
```

In the `create` method, after the `return this.getById(result);` line, add notification triggers. Replace the final return:

```js
    const reply = this.getById(result);

    // Notify post author
    NotificationService.notifyPostAuthor(post_id, {
      type: 'reply',
      actor_id: user_id,
      reply_id: result,
      content: content.slice(0, 200)
    });

    // Notify @mentioned users
    NotificationService.notifyMentionedUsers(content, post_id, user_id, result);

    return reply;
```

- [ ] **Step 5: Add notification log action to constants**

In `src/utils/constants.js`, add to `LOG_ACTIONS`:

```js
  NOTIFICATION_CREATE: 'notification_create',
```

And add a new `NOTIFICATION_TYPES` object after `PERMISSIONS`:

```js
const NOTIFICATION_TYPES = {
  reply: 'reply',
  mention: 'mention'
};
```

Update the exports at the bottom:

```js
module.exports = {
  ROLES,
  ROLE_NAMES,
  POST_STATUS,
  REPLY_STATUS,
  LOG_ACTIONS,
  PERMISSIONS,
  NOTIFICATION_TYPES
};
```

- [ ] **Step 6: Register notification routes**

In `src/routes/index.js`, add:

```js
const notificationRoutes = require('./notification.routes');
const { createRoutes: createNotificationRoutes } = require('./notification.routes');
```

And mount:

```js
router.use(createNotificationRoutes('/api/v1').routes());
```

- [ ] **Step 7: Commit**

```bash
git add src/services/notification.service.js src/controllers/notification.controller.js src/routes/notification.routes.js src/services/reply.service.js src/utils/constants.js src/routes/index.js
git commit -m "feat(phase2): add notification API and auto-trigger on reply creation"
```

---

### Task 6: Frontend Types and API Client

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api/client.ts`

- [ ] **Step 1: Add new types**

In `frontend/src/types/index.ts`, append before the closing of the file:

```ts
// Phase 2: User Profile
export interface UserProfile {
  id: number;
  mindauth_id: number;
  username: string | null;
  email: string | null;
  role: UserRole;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  post_count: number;
  reply_count: number;
}

// Phase 2: Bookmarks
export interface Bookmark {
  id: number;
  created_at: string;
  post_id: number;
  title: string;
  status: string;
  category_name: string | null;
  category_id: number | null;
  author_mindauth_id: number;
  author_role: UserRole;
}

export interface BookmarkListResponse {
  data: Bookmark[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Phase 2: Notifications
export interface Notification {
  id: number;
  user_id: number;
  type: 'reply' | 'mention';
  actor_id: number;
  actor_name: string;
  actor_avatar: string | null;
  post_id: number | null;
  post_title: string | null;
  reply_id: number | null;
  content: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  data: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

- [ ] **Step 2: Add API client methods**

In `frontend/src/lib/api/client.ts`, append before the closing of the `adminApi` section:

```ts
// User APIs
export const userApi = {
  getById: (id: number) => request<UserProfile>(`/api/v1/users/${id}`),
  getMyProfile: () => request<UserProfile>('/api/v1/users/me'),
  updateProfile: (data: { username?: string; bio?: string }) =>
    request<UserProfile>('/api/v1/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  uploadAvatar: (formData: FormData) =>
    request<{ avatar_url: string }>('/api/v1/users/me/avatar', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type with boundary
    }),
  removeAvatar: () =>
    request<void>('/api/v1/users/me/avatar', { method: 'DELETE' }),
  getMyReplies: (params?: { page?: number; limit?: number }) =>
    request<ReplyListResponse>(`/api/v1/users/me/replies${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
};

// Bookmark APIs
export const bookmarkApi = {
  list: (params?: { page?: number; limit?: number }) =>
    request<BookmarkListResponse>(`/api/v1/bookmarks${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
  check: (postId: number) =>
    request<{ bookmarked: boolean }>(`/api/v1/bookmarks/check/${postId}`),
  add: (postId: number) =>
    request<Bookmark>(`/api/v1/bookmarks/${postId}`, { method: 'POST' }),
  remove: (postId: number) =>
    request<void>(`/api/v1/bookmarks/${postId}`, { method: 'DELETE' }),
};

// Notification APIs
export const notificationApi = {
  list: (params?: { page?: number; limit?: number }) =>
    request<NotificationListResponse>(`/api/v1/notifications${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
  unreadCount: () =>
    request<{ count: number }>('/api/v1/notifications/unread-count'),
  markAsRead: (id: number) =>
    request<void>(`/api/v1/notifications/${id}/read`, { method: 'PUT' }),
  markAllAsRead: () =>
    request<void>('/api/v1/notifications/read-all', { method: 'PUT' }),
};
```

- [ ] **Step 3: Fix uploadAvatar Content-Type override**

The `request` function in `client.ts` sets `'Content-Type': 'application/json'` by default. For avatar upload, we need to override it. Update the `request` function to allow header override — change the headers merging line (line ~61):

```tsx
      headers: {
        'Content-Type': 'application/json',
        'X-API-Version': '1',
        ...options.headers,
      },
```

Since `options.headers` is spread after, passing `headers: {}` won't remove the Content-Type. We need to explicitly set it to undefined or the correct multipart value. Instead, let's handle it in the `uploadAvatar` call — the browser's FormData will auto-set the correct Content-Type with boundary when we don't set it.

Update the `request` function to handle FormData:

```tsx
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = options.method || 'GET';
  const cacheKey = getCacheKey(path, options);

  // Return cached data for GET requests
  if (cacheKey) {
    const cached = getCached<T>(cacheKey);
    if (cached !== null) return cached;
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  const isFormData = options.body instanceof FormData;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: isFormData
        ? { 'X-API-Version': '1', ...options.headers }
        : { 'Content-Type': 'application/json', 'X-API-Version': '1', ...options.headers },
      credentials: 'include',
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Network error');
  }
  // ... rest unchanged
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api/client.ts
git commit -m "feat(phase2): add frontend types and API client methods for user/bookmark/notification"
```

---

### Task 7: Frontend — User Profile Page Rewrite

**Files:**
- Modify: `frontend/src/app/(public)/users/[id]/page.tsx` (complete rewrite)

- [ ] **Step 1: Rewrite user profile page**

Replace the entire contents of `frontend/src/app/(public)/users/[id]/page.tsx`:

```tsx
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import Badge from '@/components/ui/badge';
import { UserProfile, PostListResponse, Reply } from '@/types';
import { Calendar, Mail, MessageSquare, FileText, Bookmark } from 'lucide-react';
import { notFound } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchUserProfile(userId: number): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/users/${userId}`, { next: { tags: [`user-${userId}`] } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

async function fetchUserPosts(userId: number, page: number): Promise<PostListResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/posts?page=${page}&limit=20&user_id=${userId}`, { next: { tags: ['posts'] } });
    if (!res.ok) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    const json = await res.json();
    if (!json.success) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    return {
      data: json.data || [],
      pagination: json.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 },
    };
  } catch {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }
}

async function fetchUserReplies(userId: number, page: number): Promise<{ data: Reply[]; pagination: PostListResponse['pagination'] }> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/users/${userId}/replies?page=${page}&limit=20`, { next: { tags: ['replies'] } });
    if (!res.ok) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    const json = await res.json();
    if (!json.success) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    return {
      data: json.data || [],
      pagination: json.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 },
    };
  } catch {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }
}

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string; tab?: string };
}) {
  const userId = parseInt(params.id);
  const page = parseInt(searchParams.page || '1');
  const tab = searchParams.tab || 'posts';

  const profile = await fetchUserProfile(userId);
  if (!profile) return notFound();

  const [postsResult, repliesResult] = await Promise.all([
    tab === 'posts' ? fetchUserPosts(userId, page) : Promise.resolve({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } as PostListResponse['pagination'] }),
    tab === 'replies' ? fetchUserReplies(userId, page) : Promise.resolve({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } as PostListResponse['pagination'] }),
  ]);

  const displayName = profile.username || `User #${profile.id}`;
  const roleVariant = profile.role === 'admin' ? 'warning' : profile.role === 'moderator' ? 'success' : 'default' as const;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* User Info Card */}
      <div className="bg-white rounded-lg border border-surface-200 p-6 mb-8">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full overflow-hidden bg-primary-100 flex items-center justify-center text-2xl font-bold text-primary-600 shrink-0">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-surface-900 mb-1">
              {displayName}
            </h1>
            <div className="flex items-center gap-3 mb-3">
              <Badge variant={roleVariant}>{profile.role}</Badge>
            </div>
            {profile.bio && (
              <p className="text-sm text-surface-600 mb-3">{profile.bio}</p>
            )}
            <div className="flex flex-wrap gap-4 text-sm text-surface-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                加入于 {new Date(profile.created_at).toLocaleDateString('zh-CN')}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                {profile.post_count} 帖子
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-4 h-4" />
                {profile.reply_count} 回复
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-200 mb-6">
        <nav className="flex gap-4">
          <Link
            href={`/users/${userId}?tab=posts`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'posts'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            帖子
          </Link>
          <Link
            href={`/users/${userId}?tab=replies`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'replies'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            回复
          </Link>
          <Link
            href={`/users/${userId}?tab=bookmarks`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'bookmarks'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            <Bookmark className="w-4 h-4 inline mr-1" />
            收藏
          </Link>
        </nav>
      </div>

      {/* Content */}
      {tab === 'posts' && (
        <>
          {postsResult.data.length === 0 ? (
            <div className="text-center py-12 text-surface-500">暂无帖子</div>
          ) : (
            <div className="space-y-3">
              {postsResult.data.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
          <Pagination
            currentPage={postsResult.pagination.page}
            totalPages={postsResult.pagination.totalPages}
            basePath={`/users/${userId}?tab=posts`}
          />
        </>
      )}

      {tab === 'replies' && (
        <>
          {repliesResult.data.length === 0 ? (
            <div className="text-center py-12 text-surface-500">暂无回复</div>
          ) : (
            <div className="space-y-3">
              {repliesResult.data.map((reply) => (
                <div key={reply.id} className="bg-white rounded-lg border border-surface-200 p-4">
                  <div className="flex items-center gap-2 text-sm text-surface-500 mb-2">
                    <Link href={`/posts/${reply.post_id}`} className="text-primary-600 hover:text-primary-700 font-medium">
                      {reply.post_title || '帖子'}
                    </Link>
                    <span>·</span>
                    <span>{new Date(reply.created_at).toLocaleString('zh-CN')}</span>
                  </div>
                  <p className="text-sm text-surface-700 line-clamp-3">{reply.content}</p>
                </div>
              ))}
            </div>
          )}
          <Pagination
            currentPage={repliesResult.pagination.page}
            totalPages={repliesResult.pagination.totalPages}
            basePath={`/users/${userId}?tab=replies`}
          />
        </>
      )}

      {tab === 'bookmarks' && (
        <div className="text-center py-12 text-surface-500">
          收藏功能需要登录后查看
        </div>
      )}
    </div>
  );
}
```

Note: The bookmarks tab will be handled by a client component in Task 9. For now it shows a placeholder.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/\(public\)/users/\[id\]/page.tsx
git commit -m "feat(phase2): rewrite user profile page with real user data and tabs"
```

---

### Task 8: Frontend — Profile Edit Page with Avatar Upload

**Files:**
- Create: `frontend/src/app/(auth)/users/me/edit/page.tsx` (client component)
- Create: `frontend/src/components/forum/avatar-uploader.tsx`

- [ ] **Step 1: Create avatar uploader component**

Create `frontend/src/components/forum/avatar-uploader.tsx`:

```tsx
'use client';

import { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import Alert from '@/components/ui/alert';

interface AvatarUploaderProps {
  currentAvatar?: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}

export default function AvatarUploader({ currentAvatar, onUpload, onRemove }: AvatarUploaderProps) {
  const [preview, setPreview] = useState<string | null>(currentAvatar || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    // Validate size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('图片大小不能超过 2MB');
      return;
    }

    setError(null);
    setUploading(true);

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
      setPreview(currentAvatar || null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      await onRemove();
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Avatar Preview */}
      <div className="relative w-24 h-24 rounded-full overflow-hidden bg-surface-100 border-2 border-surface-200">
        {preview ? (
          <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full">
            <ImageIcon className="w-8 h-8 text-surface-400" />
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1"
        >
          <Upload className="w-3 h-3" />
          上传
        </button>
        {preview && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading}
            className="px-3 py-1.5 text-sm bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 disabled:opacity-50 flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            删除
          </button>
        )}
      </div>

      {error && <Alert type="error" message={error} />}
      <p className="text-xs text-surface-400">支持 JPEG、PNG、GIF、WebP，最大 2MB</p>
    </div>
  );
}
```

- [ ] **Step 2: Create profile edit page**

Create `frontend/src/app/(auth)/users/me/edit/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/api/client';
import { UserProfile } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import AvatarUploader from '@/components/forum/avatar-uploader';
import { ArrowLeft } from 'lucide-react';

export default function ProfileEditPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    userApi.getMyProfile()
      .then((data) => {
        setProfile(data);
        setUsername(data.username || '');
        setBio(data.bio || '');
      })
      .catch((err) => setError(err.message));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await userApi.updateProfile({ username, bio });
      setProfile(updated);
      setMessage('资料已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const result = await userApi.uploadAvatar(formData);
    setProfile((prev) => prev ? { ...prev, avatar_url: result.avatar_url } : null);
  };

  const handleAvatarRemove = async () => {
    await userApi.removeAvatar();
    setProfile((prev) => prev ? { ...prev, avatar_url: null } : null);
  };

  if (!profile) {
    return <div className="max-w-2xl mx-auto px-4 py-8 text-center text-surface-500">加载中...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="p-1 text-surface-500 hover:text-surface-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-surface-900">编辑资料</h1>
      </div>

      <div className="bg-white rounded-lg border border-surface-200 p-6 space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center pb-6 border-b border-surface-100">
          <h2 className="text-sm font-semibold text-surface-700 mb-4 self-start">头像</h2>
          <AvatarUploader
            currentAvatar={profile.avatar_url}
            onUpload={handleAvatarUpload}
            onRemove={handleAvatarRemove}
          />
        </div>

        {/* Nickname */}
        <div>
          <label className="block text-sm font-semibold text-surface-700 mb-2">昵称</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={30}
            className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="输入昵称"
          />
          <p className="text-xs text-surface-400 mt-1">{username.length}/30</p>
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-semibold text-surface-700 mb-2">个人简介</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={4}
            className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            placeholder="介绍一下自己..."
          />
          <p className="text-xs text-surface-400 mt-1">{bio.length}/500</p>
        </div>

        {/* Messages */}
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t border-surface-100">
          <Button variant="ghost" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add edit link to user profile page**

In `frontend/src/app/(public)/users/[id]/page.tsx`, after the user's name section (after the `</div>` that closes the avatar+info section), add an edit link. Import `useAuth` — wait, this is a server component. We need a client component for the edit button, or add it as a simple Link that checks the route.

Actually, the simplest approach: add a small "编辑资料" link that only appears when viewing your own profile. Since this is SSR, we can't check auth. Let's add it as a client component wrapper.

Create `frontend/src/components/forum/profile-edit-link.tsx`:

```tsx
'use client';

import { useAuth } from '@/lib/auth/context';
import Link from 'next/link';
import { Settings } from 'lucide-react';

export default function ProfileEditLink({ userId }: { userId: number }) {
  const { user } = useAuth();
  if (!user || user.id !== userId) return null;

  return (
    <Link
      href="/users/me/edit"
      className="flex items-center gap-1 text-sm text-surface-500 hover:text-primary-600 transition-colors"
    >
      <Settings className="w-3.5 h-3.5" />
      编辑资料
    </Link>
  );
}
```

Then in the profile page, import it and add it after the Badge row:

```tsx
import ProfileEditLink from '@/components/forum/profile-edit-link';
```

After the `<Badge>` line inside the user info card:

```tsx
              <ProfileEditLink userId={profile.id} />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/forum/avatar-uploader.tsx frontend/src/components/forum/profile-edit-link.tsx frontend/src/app/\(auth\)/users/me/edit/page.tsx frontend/src/app/\(public\)/users/\[id\]/page.tsx
git commit -m "feat(phase2): add profile edit page with avatar upload"
```

---

### Task 9: Frontend — Bookmark Button on Post Detail + Bookmarks Tab

**Files:**
- Create: `frontend/src/components/forum/bookmark-button.tsx`
- Modify: `frontend/src/app/(public)/posts/[id]/page.tsx` (add bookmark button)
- Modify: `frontend/src/app/(public)/users/[id]/page.tsx` (bookmarks tab)

- [ ] **Step 1: Create bookmark button component**

Create `frontend/src/components/forum/bookmark-button.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { bookmarkApi } from '@/lib/api/client';
import { Bookmark } from 'lucide-react';

interface BookmarkButtonProps {
  postId: number;
}

export default function BookmarkButton({ postId }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bookmarkApi.check(postId)
      .then((data) => setBookmarked(data.bookmarked))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId]);

  const toggle = async () => {
    try {
      if (bookmarked) {
        await bookmarkApi.remove(postId);
      } else {
        await bookmarkApi.add(postId);
      }
      setBookmarked(!bookmarked);
    } catch {
      // Silently fail — user can retry
    }
  };

  if (loading) return null;

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
        bookmarked
          ? 'bg-primary-50 border-primary-200 text-primary-600'
          : 'bg-white border-surface-200 text-surface-600 hover:text-primary-600 hover:border-primary-200'
      }`}
      title={bookmarked ? '取消收藏' : '收藏'}
    >
      <Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />
      {bookmarked ? '已收藏' : '收藏'}
    </button>
  );
}
```

- [ ] **Step 2: Add bookmark button to post detail page**

In `frontend/src/app/(public)/posts/[id]/page.tsx`, add the bookmark button next to the post title or in the PostContent area. Since `PostContent` is a separate component, let's add it after the breadcrumb and before the PostContent.

Add the import:

```tsx
import BookmarkButton from '@/components/forum/bookmark-button';
```

After the breadcrumb `<nav>` and before `<PostContent post={post} />`:

```tsx
      {/* Bookmark Button */}
      <div className="flex justify-end mb-4">
        <BookmarkButton postId={postId} />
      </div>
```

- [ ] **Step 3: Create bookmarks client component for user profile tab**

The bookmarks tab in the user profile page is SSR, but bookmark data requires authentication. Create a client component:

Create `frontend/src/components/forum/user-bookmarks.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { bookmarkApi } from '@/lib/api/client';
import { Bookmark } from '@/types';
import Link from 'next/link';
import { Bookmark as BookmarkIcon } from 'lucide-react';

export default function UserBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bookmarkApi.list({ page: 1, limit: 20 })
      .then((data) => setBookmarks(data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8 text-surface-400">加载中...</div>;

  if (bookmarks.length === 0) {
    return <div className="text-center py-12 text-surface-500">暂无收藏</div>;
  }

  return (
    <div className="space-y-3">
      {bookmarks.map((bm) => (
        <div key={bm.id} className="bg-white rounded-lg border border-surface-200 p-4 flex items-center gap-3">
          <BookmarkIcon className="w-4 h-4 text-primary-600 shrink-0 fill-current" />
          <Link href={`/posts/${bm.post_id}`} className="text-sm font-medium text-surface-900 hover:text-primary-600 truncate">
            {bm.title}
          </Link>
          {bm.category_name && (
            <span className="text-xs text-surface-400 shrink-0">{bm.category_name}</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Replace bookmarks placeholder in profile page**

In `frontend/src/app/(public)/users/[id]/page.tsx`, replace the bookmarks placeholder:

Import the component:
```tsx
import UserBookmarks from '@/components/forum/user-bookmarks';
```

Replace:
```tsx
      {tab === 'bookmarks' && (
        <div className="text-center py-12 text-surface-500">
          收藏功能需要登录后查看
        </div>
      )}
```

With:
```tsx
      {tab === 'bookmarks' && <UserBookmarks />}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/forum/bookmark-button.tsx frontend/src/components/forum/user-bookmarks.tsx frontend/src/app/\(public\)/posts/\[id\]/page.tsx frontend/src/app/\(public\)/users/\[id\]/page.tsx
git commit -m "feat(phase2): add bookmark button and bookmarks tab to user profile"
```

---

### Task 10: Static File Serving for Avatars + Final Verification

**Files:**
- Modify: `src/index.js` or `src/app.js` (add static file serving)

- [ ] **Step 1: Ensure static file serving for uploads**

Read `src/index.js` and add the koa-static mount for uploads if not already present:

```js
const path = require('path');
const serve = require('koa-static');

// After existing static file mounts, add:
app.use(serve(path.join(__dirname, '../uploads'), { prefix: '/uploads' }));
```

- [ ] **Step 2: Verify full stack**

Start the backend:

```bash
cd G:\MindProject\MindFourm && npm run dev
```

Test endpoints manually (in a separate terminal):

```bash
# Health check
curl http://localhost:4000/api/health

# Check new routes mount (should 401, not 404)
curl http://localhost:4000/api/v1/users/me
curl http://localhost:4000/api/v1/bookmarks
curl http://localhost:4000/api/v1/notifications/unread-count
```

Expected: All return 401 (unauthorized), not 404 (not found). This confirms routes are mounted.

- [ ] **Step 3: Start frontend and verify UI**

```bash
cd G:\MindProject\MindFourm\frontend && npm run dev
```

Visit:
- `http://localhost:3000/users/[your-user-id]` — should show profile with avatar, bio, post/reply counts
- `http://localhost:3000/users/me/edit` — should show edit form with avatar upload
- `http://localhost:3000/posts/[any-post-id]` — should show bookmark button
- `http://localhost:3000/users/[your-user-id]?tab=bookmarks` — should show bookmarks list

- [ ] **Step 4: Final commit**

```bash
git add src/index.js
git commit -m "feat(phase2): add static file serving for avatar uploads"
```
