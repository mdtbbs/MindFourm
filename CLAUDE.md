# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MindForum is a forum system integrated with MindAuth for OAuth SSO. It provides posts, replies, categories, tags, user profiles, bookmarks, notifications, private messages, attachments, and a resource center. Admin panel for content moderation.

## Commands

### Backend (Koa)
```bash
npm install          # Install dependencies
npm start            # Production mode (port 4000)
npm run dev          # Development with --watch
```

### Frontend (Next.js + TypeScript)
```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Development (port 3000)
npm run build        # Production build
npm start            # Production server
```

### E2E Tests (Playwright)
```bash
npx playwright test                  # Run all tests
npx playwright test --ui             # Interactive UI mode
npx playwright test auth.spec.ts     # Run specific test file
```

## Architecture

### Backend (Koa.js) - Three-Layer Pattern

```
src/
├── index.js          # Entry: init DB → start server → handle SIGINT/SIGTERM
├── app.js            # Koa setup: compress, CORS, error, bodyParser, static, routes
├── config/           # Environment config (mindauth, easymanager, session)
├── database/
│   ├── index.js      # better-sqlite3 init, WAL mode, schema migrations
│   ├── schema.sql    # All tables and indexes
│   └── migrations/   # Schema evolution scripts
├── routes/
│   ├── index.js      # Route registry: legacy + v1 versioned routes
│   └── *.routes.js   # Router modules with factory pattern for versioning
├── controllers/      # Request handling → call Service → Response wrapper
├── services/         # Business logic, DB operations, core functionality
├── middleware/       # auth, permission, rate-limit, validate, upload, ban-check
├── utils/            # constants (PERMISSIONS), response, markdown, cursor
└── validators/       # Joi validation schemas
```

### Frontend (Next.js 14 App Router)

```
frontend/src/
├── app/
│   ├── (public)/     # Public pages: home, posts/[id], categories, tags, users, search
│   ├── (auth)/       # Auth-required: posts/new, users/me/edit, notifications
│   ├── admin/        # Admin panel: dashboard, users, posts, moderation, settings
│   └── layout.tsx    # Global layout with AuthProvider
├── lib/
│   ├── api/client.ts # Unified API client with 30s cache, clearCache on mutation
│   └── auth/context.tsx # React Context: user, isAuthenticated, logout, refreshAuth
├── components/       # forum/, admin/, ui/ (reusable components)
├── hooks/            # use-draft.ts (local storage draft persistence)
└── types/            # TypeScript interfaces
```

## Key Patterns

### Authentication Flow
1. User clicks login → redirect to MindAuth `/authorize`
2. MindAuth redirects back with `code` → `/api/auth/callback`
3. Backend exchanges code with MindAuth `/api/token`
4. Create/update local user record (`users.mindauth_id`)
5. Create session (`sessions` table), set cookie `forum_session`
6. Middleware validates session + verifies MindAuth token (if present)

Session validation (auth.js middleware):
- Token from `Authorization: Bearer` header or `forum_session` cookie
- Query session with user JOIN → if `mindauth_token` present, verify with MindAuth `/api/verify`
- OAuth sessions (no mindauth_token) trust local user data from JOIN

### Route Versioning
- Legacy routes: `/api/posts`, `/api/admin/*`
- v1 routes: `/api/v1/posts`, `/api/v1/users/*` (new features)
- Response header: `X-API-Version: 1` or `X-API-Version: legacy`
- Factory pattern: `createRoutes(prefix)` function in each routes file

### Permission System
```javascript
// src/utils/constants.js - PERMISSIONS map
POST_DELETE_ANY: ['moderator', 'admin']
POST_PIN: ['moderator', 'admin']
CATEGORY_MANAGE: ['admin']

// middleware/permission.js
requirePermission('POST_DELETE_ANY')     // role-based check
requireOwnershipOrPermission('POST_EDIT_ANY', getPostUserId)  // owner OR role
requireAdmin / requireModerator          // direct role check
```

### Response Wrapper
All controllers use `Response.success(ctx, data)` or `Response.error(ctx, message, status, code)` for consistent JSON format: `{ success: true/false, data/message, code? }`

### Cursor Pagination (PostService.getListCursor)
- Encodes cursor as `base64(created_at|id)` for stable pagination
- Separates pinned posts (always first) from regular posts
- Fetches `limit + 1` to determine `has_more`
- Avoids offset-based pagination performance issues on large datasets

### Batch Tag Loading
`TagService.getPostTagsForMultiplePosts(postIds)` fetches all tags in single query, avoiding N+1 problem when listing posts with tags.

### Server-Associated Posts
Posts can be linked to EasyManager servers via `server_id` column with `post_type` ('normal' | 'server_announcement'). Used for server-specific discussions and announcements.

## Database

### Core Tables
- `users` - mindauth_id (unique), username, email, role, avatar_url, bio
- `sessions` - user_id, session_token, mindauth_token, expires_at
- `posts` - user_id, category_id, server_id, post_type, title, content/content_html, status, is_pinned, deleted_at
- `replies` - post_id, user_id, parent_reply_id (nested), content, status, deleted_at
- `categories` - name, slug, sort_order, is_active
- `tags` / `post_tags` - Tag system with slug-based lookup
- `bookmarks` - user_id, post_id unique pair
- `notifications` - type (reply/mention/message), actor_id, is_read
- `messages` - sender_id, recipient_id, deleted_by_sender, deleted_by_recipient (bidirectional soft delete)
- `attachments` - post_id/reply_id, file metadata
- `resources` - Resource center with approval workflow
- `operation_logs` - Admin audit trail (action, target_type, target_id, ip_address)
- `settings` - KV store with categories (site, seo, announce, email, general)
- `bans` - ban_type (ip/user), value, is_active

### Key Indexes (schema.sql)
- `idx_posts_list` - Composite: (deleted_at, status, is_pinned DESC, created_at DESC) for main listing
- `idx_replies_list` - Composite: (post_id, deleted_at, created_at ASC)
- `idx_sessions_validate` - Composite: (session_token, expires_at) for auth middleware
- `idx_posts_server_id` / `idx_posts_post_type` - Server-associated posts
- `idx_notifications_user` - Composite: (user_id, is_read, created_at DESC)

### Database Config (database/index.js)
- WAL mode for concurrent read/write
- Foreign keys enabled
- 5-second busy_timeout
- Schema migrations via ALTER TABLE with duplicate check

## Environment Variables

Backend `.env`:
- `PORT=4000`
- `DB_PATH=./data/forum.db`
- `FRONTEND_URL=http://localhost:3000`
- `MINDAUTH_URL=http://localhost:4001`
- `MINDAUTH_CLIENT_ID`, `MINDAUTH_CLIENT_SECRET`
- `MINDAUTH_CALLBACK_URL=http://localhost:4000/api/auth/callback`

Frontend `.env.local`:
- `NEXT_PUBLIC_API_URL=http://localhost:4000`
- `NEXT_PUBLIC_MINDAUTH_URL=http://localhost:4001`

## Integration Points

### MindAuth OAuth
- Redirect: `${MINDAUTH_URL}/authorize?client_id=...&redirect_uri=...&state=...`
- Callback: `/api/auth/callback?code=...&state=...`
- Token exchange: POST `${MINDAUTH_URL}/api/token` with `{ code, client_id, client_secret }`
- Session verify: POST `${MINDAUTH_URL}/api/verify` with `{ session_token }`

### EasyManager (Server Management)
Service layer calls (`src/services/server.service.js`) proxy to EasyManager with `X-Service-Key` header:
- `/api/forum/servers/public` - Public server list (no auth, service key)
- `/api/forum/user/:id/servers` - User's owned servers (service key + user ID)
- `/api/forum/servers/:id/basic` - Basic server info for forum display
- `/api/forum/apply` - Apply for new server
- `/api/versions` - Available Mindustry versions
- `/api/templates` - Server templates

Service layer (`src/services/server.service.js`) fetches from EasyManager API using configured API key.

## Frontend API Client (lib/api/client.ts)

Exports typed API functions:
- `authApi` - check, verifySession, logout
- `postApi` - getList, getListCursor, getById, create, update, delete
- `replyApi` - getByPost, create, update, delete
- `categoryApi` / `tagApi` - Read-only category/tag access
- `userApi` - getById, getMyProfile, updateProfile, uploadAvatar
- `bookmarkApi` - list, check, add, remove
- `notificationApi` - list, listCursor, unreadCount, markAsRead, markAllAsRead
- `messageApi` - send, getConversations, getConversation, unreadCount, delete
- `resourceApi` - list, getById, download, upload, delete, getCategories
- `serverApi` - EasyManager integration APIs
- `adminApi` - Full admin panel operations

Cache: 30-second TTL for GET requests, `clearCache()` called on all mutations.