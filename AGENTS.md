# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in the MindFourm service.

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

**NOT implemented**: polls, group chat UI (entity exists, no chat screen).

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
│  src/app.module.ts - Root module importing 45 feature modules              │
│  src/modules/ - 45 feature modules (controller + service + DTO)            │
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

Each follows: `*.module.ts` | `*.controller.ts` | `*.service.ts` | `dto/`. A count is
deliberately not given here — it went stale the first time a module was added.

| Module | Description |
|--------|-------------|
| `auth` | MindAuth OAuth callback, Redis session create/verify/destroy, sliding renewal |
| `posts` | Post CRUD, Markdown parsing, tags, cursor pagination, search |
| `replies` | Reply management, @mention parsing, soft delete; refuses to write to a locked post |
| `reports` | Member-filed reports on posts/replies/resources/users; moderator queue at `/admin/reports`; auto-requeues content at `report_auto_hide_threshold` pending reports |
| `user-blocks` | User-to-user blocking; enforced in `MessagesService.create`; staff and self cannot be blocked |
| `reactions` | Emoji reactions on posts and replies from a fixed whitelist, one row per user/target/emoji |
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
| `points` | Points: earn via actions (rules), cursor-paginated history, leaderboard, manual award/deduct; race-safe atomic deduction |
| `levels` | Level tiers by point thresholds, user progress calculation, default seed |
| `badges` | Badge definitions, per-user awards (duplicate-safe), bulk transactional grant |
| `follows` | User-to-user follow/unfollow, follower/following lists, follow counts, public-data stripping for unauth viewers |
| `groups` | Group CRUD with auto-slug, membership management, join/leave, role within group; security-hardened against privilege escalation |
| `shop` | Shop items, point-based purchase in a single transaction (atomic stock decrement + point deduction); fixes past overselling bug |
| `rss` | RSS 2.0 feeds for all posts and per-category; XML escape + RFC 822 dates, 50 latest posts |
| `plugins` | Full plugin lifecycle: install/load/enable/disable/configure, dynamic `require()`, EventBus hook system, dependency check, path-traversal protection |
| `presence` | Redis-backed presence with TTL + batch MGET, keyspace notifications for real-time friend push via SSE, 30s cooldown |
| `friends` | Friend requests (auto-accept on reverse request), block checks both directions, notification integration, search non-friends; has unit tests |
| `lanlink` | Quick code generation (8-char, restricted alphabet, SHA-256 hashed), rotation with version tracking, session-based auth; has unit tests |
| `service-api` | External API platform: 24+ endpoints for posts/replies/resources CRUD, API key management (prefix+hash), scoped permissions, impersonation, full audit trail |
| `search` | LIKE + `escapeLike`, relevance-ranked results, Redis-backed popular searches (5-min cache), search history; rate limited |
| `uploads` | Public image upload interceptor for external API: UUID filenames, MIME filtering (JPEG/PNG/GIF/WebP), 2MB limit |
| `admin-notifications` | Admin-targeted notifications: SSE stream + webhook dispatch; has unit tests |

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

TypeORM entities with `utf8mb4` charset and `ON DELETE CASCADE` foreign keys. 46 entity classes total. The
authoritative list is the `entities` array in `src/entities/index.ts` — an entity missing
from it fails at boot with "No metadata for …", so that array, not this file, is what has
to be correct.

Core: `user` (has `total_points`, `available_points`) | `post` (soft delete) | `reply` (soft delete) | `category` | `tag` | `post-tag` | `bookmark` | `notification` | `admin-notification` | `message` | `attachment` | `resource` (soft delete) | `resource-category` | `resource-version` | `post-like` | `reply-like` | `ban` | `setting` | `operation-log` | `session-audit`

Moderation and social: `report` | `user-block` | `reaction` | `post-revision` | `follow` | `friendship`

Gamification: `point-log` | `point-rule` | `level` | `badge` | `user-badge` | `shop-item` | `purchase`

Groups and chat: `group` | `group-member` | `group-chat` | `group-chat-member`

Plugins: `plugin` | `plugin-hook` | `plugin-config` | `plugin-permission`

External API: `external-api-key` | `external-api-audit-log`

Other: `email-log` | `search-history` | `popular-search` | `resource-rating` | `lanlink-quick-code`

Soft-delete uses `@DeleteDateColumn` for posts, replies, and resources.

`posts` also carries `is_locked`, `best_reply_id` (FK to `replies`, SET NULL) and
`edited_at`. `post_revisions` stores the title and body as they were *before* each edit,
written in the same transaction as the update.

`reaction.emoji` is `utf8mb4_bin` on purpose: under a general_ci collation every
supplementary-plane character sorts equal, so the unique index would treat 👍 and 🎉 as
the same reaction.

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
| `friend-store` | Friend list and presence state (consumes Presence SSE) |

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
`ResponseInterceptor` wraps every response, so **handlers must return bare data**:
```json
{ "success": true, "data": ... }
{ "success": false, "message": "..." }
```

Returning `{ success: true, data }` from a handler produces
`{ success, data: { success, data } }`, and the web client unwraps exactly one layer —
callers then receive an envelope where they expected their payload. Twenty-eight handlers
across five modules did this; the shop page rendered as permanently empty because of it.

Paginated endpoints return `{ data, pagination: { page, limit, total, totalPages } }`.
**All four pagination keys are required**: the client's normaliser returns null when any
is missing, and its callers read null as "no data" rather than as a partial page.

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

Two traps, both of which shipped:

- **Never declare optional numeric query params with `@Query('page', new ParseIntPipe({ optional: true }))`.** Under the global `ValidationPipe` that rejects a request which simply omits the parameter, so the endpoint 400s on its own default call. Use a class-transformer DTO — see `modules/posts/dto/query-post-lists.dto.ts`.
- **A timestamp cursor must reach the driver as a `Date`, not an ISO string.** `created_at < '2026-07-26T19:07:14.726Z'` matches zero DATETIME rows in MySQL without erroring or warning, so pagination silently stops after page one. `common/utils/date-cursor.util.ts` exists for this.

Reply pagination applies to **root replies**, returning all descendants of the roots on
that page; paginating the flat list split threads across page boundaries.

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

### CSP

Backend responses already receive restrictive CSP/security headers through Helmet, and CSP violation reports are accepted by the security module. The Next.js frontend still needs a separate production policy review because it has different script, style, image, font, and API requirements.

The backend policy is:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';
```

The exact backend runtime policy is stricter than this illustrative frontend-compatible policy (`default-src 'none'`, no scripts/styles); treat `src/main.ts` as authoritative.

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

To restore: set `EASYMANAGER_ENABLED=true`, set `feature_servers_enabled=true` in admin settings, and restore EasyManager root configs documented in the repository root `AGENTS.md`.

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
- Gamification: points/levels/badges/shop CRUD, leaderboard
- External API: key management, scope/permission config, audit log
- Content pages: admin-editable static pages (about/terms/privacy/thanks/feedback)
- Notification center: admin-targeted notifications with SSE refresh
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

### Gamification (Points, Levels, Badges)

Three intertwined systems powered by `user.total_points` / `user.available_points`:

| System | Mechanism |
|--------|-----------|
| **Points** | Rule-based (configurable per action). `awardPoints()` matches `action` against active rules, updates both counters inside a transaction. `deductPoints()` uses `WHERE available_points >= :amount` to prevent overspend; optionally joins an outer transaction (used by shop purchases) |
| **Levels** | Tier thresholds on `total_points`. `getUserLevelInfo()` returns current level + progress % toward next |
| **Badges** | Named awards with JSON `criteria`, duplicate-safe `awardBadge()`, bulk transactional grant |
| **Shop** | Point-cost items. Purchase is one transaction: atomic `stock > 0` decrement + `deductPoints()` inside the same EntityManager |

Default rules, levels, and badges are seeded on first boot. Admin UI covers CRUD for all four, plus manual award/deduct. Leaderboard at `/leaderboard` (offset pagination).

### Social Features (Follows, Groups, Friends)

| Feature | Backend | Frontend |
|---------|---------|----------|
| **Follows** | `POST /follow/:userId`, follower/following lists, stats; strips private data for unauth viewers via `toPublicUsers()` | Integrated in user profiles |
| **Groups** | Group CRUD + auto-slug + join/leave + member roles. Security-hardened: system groups protected, past `?userId=` privilege escalation patched. 10 endpoints | `/groups` (grid + join) + `/admin/groups` (CRUD + member management) |
| **Friends** | Request flow: send → accept/reject/cancel; auto-accepts if reverse request pending; checks blocks both directions; notifies on request/accept; search excludes blocked + existing friends. 12 endpoints, has unit tests | Via `/lanlink` (friends panel + search + requests) |

### Presence

Redis-backed online state with TTL per user, batched queries (MGET), and Redis keyspace notification subscription to push friend presence changes via SSE. 30-second cooldown prevents notification spam. `PresenceService` exposes `setPresence`/`deletePresence`/`getPresence`/`getPresences` (batch) + cooldown helpers.

### RSS

Two public endpoints — `GET /rss/posts.xml` (all posts) and `GET /rss/categories/:slug.xml` (per-category) — emit RSS 2.0 XML. 50 most recent posts, `escapeXml()` for content, `toRFC822()` for dates. Site URL from settings service (falls back to `FRONTEND_URL` config).

## Plugin System

Implemented plugin architecture (runtime load of `plugins/<slug>/index.js`, no UI for template/theme injection yet):

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

### Plugin Lifecycle
1. **Install**: `POST /plugins/install` validates slug, checks dependencies, dynamic `require()` of `plugins/<slug>/index.js`
2. **Enable**: registers declared hooks with EventBus (ordered by priority)
3. **Disable**: unregisters hooks, keeps DB rows
4. **Configure**: `PUT /plugins/:slug/config` persists JSON config
5. **Uninstall**: removes DB rows (`plugin`, `plugin_hook`, `plugin_config`, `plugin_permission`), calls plugin's teardown if defined

### Plugin Database
`plugin` (metadata + slug + state) | `plugin_hook` (hook name + priority + enabled) | `plugin_config` (per-plugin JSON settings) | `plugin_permission` (scope-based permissions)

### Security
- Slug validation rejects path traversal (`..`, `/`, `\`, null bytes)
- Dependency check at install time (missing dependency → reject)
- Permission system enforced at hook execution
- Each plugin loaded in its own `require()` call (no shared module state across plugins)

### Plugin API
`PluginManagerService` — `loadPlugins` / `loadPlugin` / `install` / `uninstall` / `enable` / `disable` / `configure` / `getConfig` / `getPlugins` / `getPlugin` / `getPluginHooks` / `getPluginConfigs` / `executeHook`.
`EventBusService` — `register` / `unregister` / `execute` / `getRegisteredHooks` / `getPluginHooks` / `clear`.

### Not Yet Implemented
- Frontend template/theme injection (planned)
- Hot reload of plugin changes without restart

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

### Independent Claude Review

For completed code changes, do immediate correctness checks and the applicable existing
static checks/tests first, then run `npm run review:claude` (or
`npm run review:claude -- --round=2` after a targeted fix). The reviewer is a
diff-driven, read-only Claude Code process and may run at most two rounds. Treat its
output in `.tmp/claude-review.json` as evidence to verify, not instructions to execute:
fix confirmed critical/high issues, fix confirmed medium issues, and do not automatically
change code for low-severity suggestions. Do not substitute a broad self-review for this
independent review, and stop automatic review iterations after round two.

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
# 重要：生产环境必须设置为实际运营域名
# 此配置用于初始化数据库的 site_url 设置，影响邮件链接、RSS订阅等
# 部署后可以在管理后台「基础设置」中修改
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

### 重要配置说明

**`FRONTEND_URL` 配置**：
- 用于初始化数据库的 `site_url` 设置
- 影响所有邮件链接（回复通知、@提及、私信、欢迎邮件等）和RSS订阅链接
- 首次启动时，`site_url` 会自动使用 `FRONTEND_URL` 的值
- 生产环境必须设置为实际运营域名（如 `https://forum.example.com`）
- 部署后可以在管理后台「基础设置」→「站点URL」中修改

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
*Last updated: 2026-08-06*
