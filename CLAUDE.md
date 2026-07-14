# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in the MindFourm service.

## Project Overview

MindFourm is a forum system for the Mindustry community, integrated with:
- **MindAuth** (Port 4001): OAuth SSO login
- **MindFileList** (external `download-site` service): resource file hosting and moderated downloads
- **EasyManager** (Port 5001): ⏸ Paused. Server listings/applications are preserved in code but disabled by default (`EASYMANAGER_ENABLED=false`, `feature_servers_enabled=false`).

Features include:
- Posts and replies with Markdown support, categories, tags
- Bookmarks, likes, notifications (SSE + email + in-app, 5 types: reply/mention/like/system/report)
- Private messages with cursor pagination
- Resource center with uploads, external links, versioning
- Admin panel with dashboard, moderation, bulk ops, tag merge, cleanup
- Search (MySQL LIKE, upgrade path to Full-Text → Elasticsearch)
- Email notifications (SMTP, Handlebars templates, Bull queue, user preferences)

**NOT implemented**: polls, badges/reputation, points system, user follow, group chat, RSS, plugin management UI.

## Commands

```bash
# Backend (Port 4000) — NestJS
cd MindFourm && npm run dev

# Frontend (Port 3000) — Next.js
cd MindFourm/frontend && npm run dev

# E2E Tests
cd MindFourm && npx playwright test

# Build
cd MindFourm && npm run build

# Docker Dev
docker compose -f docker-compose.dev.yml up -d
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Next.js Frontend (Port 3000)                          │
│  App Router: (public), (auth), admin route groups                          │
│  State: Zustand (user-store, notification-store, online-store)            │
│  Data: TanStack React Query + SSE (real-time notifications)               │
└──────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   NestJS Backend (Port 4000)                               │
│  src/main.ts - Bootstrap with global prefix /api                           │
│  src/app.module.ts - Root module importing 21 feature modules              │
│  src/modules/ - 21 feature modules (controller + service + DTO)            │
│  src/common/ - Guards, filters, interceptors, decorators, utils            │
│  src/entities/ - 19 TypeORM entity definitions                             │
│  src/database/ - TypeORM MySQL + Redis modules                             │
└──────────────────────────────────────────────────────────────────────────┘
              │                    │                    │
              ▼                    ▼                    ▼
         ┌─────────┐    ┌─────────┐    ┌────────────┐
         │  MySQL  │    │  Redis  │    │  MindAuth  │
         │ Posts   │    │ Session │    │  OAuth     │
         │ Users   │    │ Cache   │    │            │
         └─────────┘    └─────────┘    └────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  MindFileList   │
                    │ Resource Files  │
                    └─────────────────┘
```

## Backend Structure (`src/`)

### Module Structure (`src/modules/`)

21 feature modules. Each follows: `*.module.ts` | `*.controller.ts` | `*.service.ts` | `dto/`

| Module | Description |
|--------|-------------|
| `auth` | MindAuth OAuth callback, Redis session create/verify/destroy, sliding renewal |
| `posts` | Post CRUD, Markdown parsing, tags, cursor pagination, search |
| `replies` | Reply management (2-level nesting), @mention parsing, soft delete |
| `users` | User profiles, avatar updates, role management |
| `categories` | Hierarchical category management (parent/child) |
| `tags` | Tag CRUD with auto-slug generation, merge support |
| `notifications` | In-app notifications (5 types), SSE events, Redis cache, email dispatch |
| `bookmarks` | Bookmark CRUD |
| `likes` | Post/reply likes with count updates |
| `messages` | Private messaging with cursor pagination |
| `attachments` | File upload with multer |
| `resources` | Resource management (upload/external), versioning, categories |
| `servers` | Paused EasyManager proxy module; returns empty/disabled responses unless enabled |
| `post-servers` | Preserved post-to-server link module for future EasyManager restoration |
| `auto-post` | Preserved EasyManager callback handler for auto-post announcements |
| `admin` | Admin panel: dashboard stats, bulk ops, moderation, tag merge, cleanup |
| `bans` | Ban management (user/IP/CIDR), in-memory cache (10s TTL) |
| `stats` | Dashboard statistics, 7-day activity charts |
| `settings` | Key-value settings with in-memory cache |
| `logs` | Operation logging service (MySQL `operation_logs` table) |

### Common Layer (`src/common/`)

**Guard Execution Order**: `JwtAuthGuard` → `RolesGuard` → `BanGuard` → `RateLimitGuard`

| Guard | Purpose |
|-------|---------|
| `jwt-auth.guard.ts` | Redis session token validation from `forum_session` cookie/header |
| `roles.guard.ts` | Role hierarchy check (numeric level comparison) |
| `permissions.guard.ts` | Fine-grained permission-based access |
| `service-auth.guard.ts` | `X-Service-Key` header validation for service-to-service calls |
| `rate-limit.guard.ts` | Atomic Lua script rate limiting (INCR + EXPIRE in single Redis call) |
| `ban.guard.ts` | IP/user ban checking with CIDR range support (IPv4 only) |

**Decorators**: `@Public()` (bypass auth), `@Roles('admin', 'moderator')` (role requirement)

**Filters**: `all-exceptions.filter.ts` — Global error handler, hides internal details

**Interceptors**: `response.interceptor.ts` — Wraps all responses in `{ success: true, data: ... }`

**Utils** (`src/common/utils/`):
| File | Purpose |
|------|---------|
| `constants.ts` | `ROLES`, `POST_STATUS`, `REPLY_STATUS`, `LOG_ACTIONS`, `PERMISSIONS` |
| `cursor.util.ts` | `encodeCursor()` / `decodeCursor()` for cursor pagination |
| `markdown.util.ts` | Markdown parsing with `marked` + `sanitize-html` |
| `response.util.ts` | `ResponseUtil` helper class |
| `search.util.ts` | `escapeLike()` for MySQL LIKE query safety |

### Database Layer (`src/database/`)

- `database.module.ts` — TypeORM MySQL connection (connection pool: 20 max, 10s timeout)
- `redis.module.ts` — Redis module
- `redis.service.ts` — Full Redis wrapper (`get`/`set`/`del`/`hset`/`hgetall`/`incr`/`expire`/`keys`/`eval`)

### Entities (`src/entities/`)

19 TypeORM entities with `utf8mb4` charset, `ON DELETE CASCADE` foreign keys:

`user` | `post` (soft delete) | `reply` (soft delete) | `category` | `tag` | `post-tag` | `bookmark` | `notification` | `message` | `attachment` | `resource` (soft delete) | `resource-category` | `resource-version` | `post-like` | `reply-like` | `ban` | `setting` | `operation-log` | `session-audit`

Soft-delete uses `@DeleteDateColumn` for posts, replies, and resources.

## Frontend Architecture (`frontend/`)

### Routing (Next.js 14 App Router)

| Route Group | Purpose | Pages |
|-------------|---------|-------|
| `(public)/` | Public pages | Home (Hero + Marquee hot posts), post list, post detail, categories, tags, user profiles, search |
| `(auth)/` | Authenticated pages | Notifications (SSE + Toast), messages, bookmarks, settings |
| `admin/` | Admin panel | Dashboard (animated StatCards), users, posts, reports, settings, announcements, sensitive words, levels, groups, shop, plugins |

### State Management (Zustand)

| Store | Responsibility |
|-------|---------------|
| `user-store` | Current user info, login state, points/badges/reputation updates |
| `notification-store` | Notification list, unread count, SSE real-time updates |
| `online-store` | Online users collection and count |

### Data Fetching & Real-time

- **TanStack React Query** for API data fetching with cache/invalidation
- **SSE (Server-Sent Events)** at `/api/notifications/events` for real-time notification delivery
- Custom hook `useSse(eventType, callback)` manages EventSource lifecycle with auto-reconnect

### UI Components

- **shadcn/ui**: Base interactive components (Button, Dialog, Input, Tabs, etc.)
- **Magic UI**: Visual animations (Hero, Marquee, AnimatedList, FadeText, Shimmer, GlowEffect, Toast, Avatar, AnimatedBeam, AnimatedShinyText, DotLoading)
- **shared package**: Cross-project reusable components (UnifiedHeader, AdminSidebar, LoginLayout, UserCard, ServerCard, StatsGrid, ActivityChart, Tabs, DataTable, Medal, Title)
- **shared-styles**: CSS design system with CSS variables (brand `#3b82f6`, 50+ component classes)
- Dark mode via `data-theme="dark"` CSS variable override, follows system preference
- `prefers-reduced-motion` support for accessibility
- Markdown rendering: `react-markdown` + `remark-gfm` (GitHub Flavored Markdown)

### Markdown Editor

Simple textarea + preview mode (no rich text editor). Backend parses with `marked` + `sanitize-html`; frontend renders with `react-markdown` + `remark-gfm`.

## Key Patterns

### Response Format
All API responses wrapped by ResponseInterceptor:
```json
{ "success": true, "data": ... }
{ "success": false, "message": "..." }
```

### Authentication
- OAuth `access_token` is **ONE-TIME use only** (to exchange code for user info)
- Primary auth: **Redis session token** in HttpOnly cookie `forum_session`
- Session TTL: 7 days (Redis), Cookie maxAge: 30 days
- **Sliding window renewal**: session TTL reset on each successful request
- `@Public()` decorator bypasses JwtAuthGuard

### Rate Limiting
- Atomic Lua script: `INCR` + conditional `EXPIRE` in single Redis call (no race conditions)
- Per-handler limits: posts 10/min, replies 30/min, login 5/5min, session verify 20/min, default 60/min

### Pagination
- **Offset-based**: `?page=1&limit=20` (limit capped at 50) — for admin panels needing total count
- **Cursor-based**: `?cursor=xxx&limit=20` — for public infinite scroll (efficient, no OFFSET penalty)

### Validation
- `class-validator` DTOs with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
- LIKE special characters (`%`, `_`, `\`) escaped via `escapeLike()` utility

### Cache Strategy (Manual, NOT CacheInterceptor)
| Data | TTL | Key Pattern | Invalidation |
|------|-----|------------|-------------|
| User session | 7 days | `session:{token}` | Sliding renewal |
| User profile | 5 min | `user:{id}` | Delete on update |
| Post detail | 5 min | `post:{id}` | Delete on update |
| Post list (home) | 1 min | `posts:home:{page}` | Delete on new post |
| Categories | 30 min | `categories:list` | Delete on change |
| Hot posts/tags | 5 min | `posts:hot` / `tags:hot` | Periodic refresh |
| System settings | 5 min | `setting:{key}` | Delete on update |
| View count | 1 min/IP | `view:post:{id}:ip:{ip}` | Anti-spam |
| Unread notifications | 5 min | `user:unread:{id}` | Update on new/read |
| Ban check | 10 sec | **In-memory Map** (not Redis) | Fast lookup |

### Soft Delete
Posts, replies, resources use `@DeleteDateColumn` — never physical deletion. Use `repository.softDelete(id)`.

## Security Design

### Role Hierarchy
```
guest(0) < user(1) < active_user(2) < core_user(3) < moderator(4) < admin(5) < super_admin(6)
```

### XSS Protection
- Backend: `sanitize-html` strips `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `on*` handlers, `javascript:` URLs
- Frontend: React (no `dangerouslySetInnerHTML`), DOMPurify for HTML rendering
- Allowed tags: h1-h6, p, br, strong, em, u, s, code, pre, blockquote, ul, ol, li, a, img, table, thead, tbody, tr, th, td, hr, details, summary
- Allowed schemes: `http`, `https`, `mailto`

### CORS
- Only `FRONTEND_URL` origin allowed
- `credentials: true` for cookie-based auth

### CSRF
- Current: Relies on CORS origin validation + HttpOnly cookie + SameSite=Lax
- No Double Submit Cookie (not needed for same-origin frontend/backend)

### Ban System
- Three types: `user` (by ID), `ip` (single IP), `ip_range` (CIDR notation)
- CIDR matching: IPv4 only currently (planned: IPv6 with `ipaddr.js`)
- In-memory Map cache with 10-second TTL for fast ban checks

### CSP (Recommended, NOT yet implemented)
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';
```

### Error Handling
- Unhandled exceptions return generic `{ success: false, message: '服务器内部错误' }`
- Stack traces never exposed to client; detailed errors logged server-side

## MindAuth OAuth Integration

```
1. User clicks login → Redirect to MindAuth /login
2. MindAuth authenticates → Redirects to /api/auth/callback?code=XYZ
3. Backend exchanges code for access_token (one-time use)
4. Backend fetches userinfo from MindAuth via access_token
5. Create/update local user by mindauth_id
6. Create Redis session, set HttpOnly forum_session cookie
```

Session audit: login/logout events recorded in `operation_logs` table. Abnormal login detection (异地 IP, unusual time).

## EasyManager Integration — ⏸ Paused

EasyManager integration is preserved but disabled by default. Backend config uses `EASYMANAGER_ENABLED=false`; frontend UI is hidden by `feature_servers_enabled=false` unless an admin re-enables it.

When disabled, `ServersService` does **not** connect to EasyManager:

| Endpoint | Disabled behavior |
|----------|-------------------|
| `GET /api/servers/public` | Returns an empty server list |
| `GET /api/servers/versions` | Returns an empty version list |
| `GET /api/servers/templates` | Returns an empty template list |
| `GET /api/servers/my` | Requires auth, then returns an empty server list |
| `POST /api/servers/apply` | Returns a "server feature disabled" error |

Preserved callback endpoints (`/api/auto-post/*`, `/api/post-servers/*`) remain in code for future restoration and are protected by `ServiceAuthGuard`.

To restore: set `EASYMANAGER_ENABLED=true`, set `feature_servers_enabled=true` in admin settings, and restore EasyManager root configs documented in the repository root `CLAUDE.md`.

## MindFileList (MFL) Integration

Users can upload resource files to MindFileList (external file hosting) instead of local storage. MFL manages file storage and download; MindFourm manages resource metadata and moderation.

### Configuration

| Env Variable | Purpose |
|-------------|---------|
| `MFL_BASE_URL` | MFL service base URL (e.g., `http://localhost:3000`) |
| `MFL_API_KEY` | MFL API key with `write` permission |

### Flow

1. User submits resource with `use_mfl=1` → MF uploads file to MFL via `POST /api/v1/files/upload`
2. MFL returns file ID → MF stores `mfl_file_id`, `mfl_download_url`, `use_mfl=1`
3. MFL file is created with `approval_status=pending` → download blocked
4. Admin approves in MF → MF calls MFL `PUT /api/v1/files/:id/approval` with `status=approved`
5. MFL download becomes available

### Database Fields (resources table)

| Column | Type | Description |
|--------|------|-------------|
| `use_mfl` | tinyint | 1 = file hosted on MFL |
| `mfl_file_id` | int | MFL file ID |
| `mfl_download_url` | varchar(500) | MFL direct download URL |

### Key Service: `MflClientService`

| Method | Purpose |
|--------|---------|
| `uploadFile(buffer, filename, category, mime, {resourceId})` | Upload to MFL with pending status |
| `updateApprovalStatus(mflFileId, status, resourceId, reason?)` | Sync approval status to MFL |
| `getDownloadUrl(mflFileId)` | Build MFL download URL |

## Feature Specifications

### Posts
- Markdown content, category assignment, multiple tags, optional attachments
- Status: draft, published, hidden, deleted (soft)
- Pinned and featured flags
- View count with anti-spam (1 min per IP per post)
- Cursor pagination for public lists, offset for admin

### Replies
- 2-level nesting (reply → reply to reply)
- @mention parsing with notification dispatch
- Soft delete with moderation support

### Notifications
- 5 types: reply, mention, like, system, report
- Delivery: in-app (DB) + SSE (real-time) + email (queued, user preference)
- Redis cache for unread count (5 min TTL)

### Admin Panel
- Dashboard: stats cards (animated), 7-day activity chart
- User management: role updates, ban/unban, quota management
- Content moderation: post/reply review, bulk delete/hide
- Tag merge, cleanup operations
- System settings, announcements, sensitive words

### Search
- Current: MySQL LIKE with keyword highlighting (`<mark>` tag)
- Search history per user, hot searches via Redis sorted set
- Search result cache (1 min for exact matches)
- Upgrade path: LIKE → Full-Text Index (>100k posts) → Elasticsearch (>1M posts)

### Email System
- SMTP configured via system settings (admin panel)
- 4 templates: reply notification, @mention, private message, system notification
- Queue: Bull (Redis-based), 3 retries with exponential backoff
- User preferences: `reply_email`, `mention_email`, `message_email`, `digest_email` (all default ON except digest)
- Unsubscribe link in every email → preferences page
- Email logs for monitoring (sent/failed/bounced)

## Plugin System (PLANNED - NOT IMPLEMENTED)

### Plugin Structure
```
plugins/<name>/
├── plugin.json         # Metadata, version, dependencies
├── index.js            # Entry point
└── config.schema.json  # Configuration schema
```

### Hook Types
| Type | Timing | Purpose |
|------|--------|---------|
| `before` | Pre-execution | Modify input params |
| `after` | Post-execution | Non-blocking side effects |
| `filter` | Transform | Transform output data |

### Available Hooks
`post.create` / `post.created` / `reply.create` / `reply.created` / `user.login` / `content.render`

### Plugin API
Access via `context.services.*` (postService, userService, etc.)

## Plugin Architecture (PLANNED - NOT IMPLEMENTED)

- **EventBus**-based hook system
- **Plugin Manager**: Installer, Loader, Registry, Config Manager
- **Frontend injection points**: header, footer, sidebar, post-toolbar, user-profile, admin-sidebar
- **Dynamic route** registration for plugins
- **Dependency management** with semver

## Frontend Template System (PLANNED - NOT IMPLEMENTED)

- **Template Registry** with priority: Plugin > Custom Theme > System Default
- **18 predefined injection points** for component injection
- Theme switching via admin panel
- Template inheritance (extends base template)

## Deployment

### Docker Development
```
mysql:8 (3306) + redis:7-alpine (6379) + backend (hot reload) + frontend (hot reload)
```

### Docker Production
```
Nginx (:443 HTTPS, :80 → redirect)
  ├── Frontend (3000)
  └── Backend (3001)
        ├── MySQL (internal)
        ├── Redis (internal)
        └── MindAuth (external)
```

### Dockerfile Pattern (multi-stage)
- Builder: `node:20-alpine` → `npm ci` → `npm run build`
- Runner: copy `dist/` + `node_modules` → `node dist/main.js` (backend) / `npm start` (frontend)
- Healthcheck: `curl -f http://localhost:3001/health` (interval=30s, timeout=10s, retries=3)

### Nginx
- HTTP → HTTPS redirect
- Static asset caching (images, CSS, JS)
- WebSocket/SSE support (`proxy_set_header Connection ''`)
- gzip compression, security headers (HSTS, X-Frame-Options)

## Performance Optimization

### Database Indexes
```sql
-- Posts
idx_posts_user_id, idx_posts_category_id,
idx_posts_status_created (status, created_at DESC),
idx_posts_is_pinned, idx_posts_is_featured, idx_posts_visibility

-- Replies
idx_replies_post_id, idx_replies_user_id,
idx_replies_parent (post_id, parent_reply_id),
idx_replies_created (post_id, created_at DESC)

-- Notifications
idx_notifications_user_read (user_id, is_read),
idx_notifications_user_created (user_id, created_at DESC)

-- Others
idx_reports_status, idx_reports_reporter, idx_reports_target,
idx_users_status, idx_users_mindauth, idx_users_online,
idx_likes_user_post, idx_bookmarks_user,
idx_messages_sender, idx_messages_recipient, idx_messages_unread
```

### Query Best Practices
- Avoid `SELECT *` — specify needed columns
- Avoid `LIKE '%keyword%'` for large datasets — use Full-Text Index
- Avoid N+1 queries — use JOINs or batch queries
- Avoid large `LIMIT offset, count` — use cursor pagination

### Connection Pool
```
connectionLimit: 20, waitForConnections: true,
queueLimit: 0, connectTimeout: 10000
```

### Performance Targets
| Metric | Target |
|--------|--------|
| LCP (First Contentful Paint) | < 2.5s |
| TTI (Time to Interactive) | < 3.5s |
| API P50 | < 200ms |
| API P95 | < 1s |
| DB Query | < 50ms |
| Redis Hit Rate | > 80% |
| Concurrent Users | > 1000 |

## Logging & Monitoring

### Winston Logger
- Levels: `error`, `warn`, `info`, `debug`, `verbose`
- Transports: Console (colorized) + DailyRotateFile (20MB max, 90-day retention, gzip compressed)
- Log files: `logs/error-%DATE%.log`, `logs/combined-%DATE%.log`

### Operation Logs
- Stored in MySQL `operation_logs` table (NOT files)
- Fields: user_id, action, target_type, target_id, details, ip_address, created_at
- Cleanup: delete records older than 90 days via `POST /admin/cleanup/logs`

### Health Check (`GET /health`)
- Application status (NestJS running)
- Database connection (TypeORM ping)
- Redis connection (ioredis ping)
- Disk space (log directory availability)

### Log Retention (Unified 90 Days)
| Type | Storage |
|------|---------|
| Error logs | Files (`logs/error-*.log`) |
| Combined logs | Files (`logs/combined-*.log`) |
| Request logs | Files (`logs/request-*.log`) |
| Operation audit | MySQL `operation_logs` table |

## Testing Strategy

| Level | Tool | Coverage Target |
|-------|------|----------------|
| Unit | Jest + mocked TypeORM Repository | > 80% |
| Integration | Jest + supertest + test database | Core API > 90% |
| E2E | **Playwright** (NOT Jest) | Core flows > 95% |
| API Contract | OpenAPI schema validation | All endpoints 100% |

### Test Structure
```
tests/
├── unit/services/          # Service layer with mocked repos
├── integration/api/        # Controller + Service with real DB
└── e2e/                    # Full browser automation (Playwright)
```

### CI/CD
GitHub Actions with MySQL 8 + Redis 7 services. Run unit → integration → API contract → coverage.

### Commands
```bash
npm run test:unit      # Unit tests
npm run test:integration  # Integration tests
npm run test:e2e       # Playwright E2E
npm run test:api       # API contract tests
npm run test           # All tests
npm run test:cov       # Coverage report
```

## Environment Setup (`MindFourm/.env`)

```bash
# Server
PORT=4000
FRONTEND_URL=http://localhost:3000

# Database
MYSQL_HOST=localhost
MYSQL_DATABASE=mindforum

# Redis
REDIS_HOST=localhost

# MindAuth OAuth
MINDAUTH_URL=http://localhost:4001
MINDAUTH_CLIENT_ID=forum
MINDAUTH_CLIENT_SECRET=<secret>

# EasyManager — 暂停中，默认关闭
EASYMANAGER_ENABLED=false
EASYMANAGER_URL=http://localhost:5001
EASYMANAGER_API_KEY=<key>

# MindFileList
MFL_BASE_URL=http://localhost:3000
MFL_API_KEY=<write-permission-key>
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Backend | NestJS v10, TypeScript, TypeORM 0.3, MySQL2, ioredis |
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| State | Zustand (stores), TanStack React Query (data) |
| Real-time | SSE (Server-Sent Events) |
| Styling | Tailwind CSS, shadcn/ui, Magic UI, shared-styles CSS |
| Animation | Framer Motion, Motion |
| Validation | class-validator + class-transformer |
| Markdown | marked + sanitize-html (backend), react-markdown + remark-gfm (frontend) |
| Email | Handlebars templates + Nodemailer + Bull (Redis queue) |
| Logging | Winston + DailyRotateFile (90-day retention) |
| Testing | Jest (unit/integration), Playwright (E2E) |
| Deployment | Docker + Docker Compose, Nginx (reverse proxy + SSL) |

---
*Last updated: 2026-07-13*
