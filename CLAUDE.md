# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MindFourm is a forum system integrated with MindAuth for OAuth SSO. It provides posts, replies, categories, tags, user profiles, bookmarks, notifications, private messages, attachments, and a resource center. Admin panel for content moderation.

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
npx playwright test --ui            # Interactive UI mode
npx playwright test auth.spec.ts    # Run specific test file
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│            Frontend (Next.js 14 App Router + TypeScript)         │
│  frontend/src/app/(public)/  - Public pages (home, posts, etc)   │
│  frontend/src/app/(auth)/    - Auth-required pages               │
│  frontend/src/app/admin/     - Admin panel                       │
│  frontend/src/lib/api/       - API client with cache             │
│  frontend/src/hooks/         - React hooks (auth, toast)         │
└─────────────────────────────────────────────────────────────────┘
                              │ fetch + credentials
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Koa API)                             │
│  src/routes/        - Route modules (legacy + v1 versions)       │
│  src/controllers/   - Request handling, Response wrapper         │
│  src/services/      - Business logic, database operations        │
│  src/middleware/    - auth, permission, rate-limit, validate     │
│  src/database/      - better-sqlite3, schema.sql, migrations     │
└─────────────────────────────────────────────────────────────────┘
                              │ OAuth token verify
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MindAuth (OAuth SSO)                        │
│  /authorize → code → /token → user info                         │
└─────────────────────────────────────────────────────────────────┘
```

## Key Patterns

### Authentication Flow
1. User clicks login → redirect to MindAuth `/authorize`
2. MindAuth redirects back with `code` → `/api/auth/callback`
3. Backend exchanges code with MindAuth `/api/token`
4. Create/update local user record (`users.mindauth_id`)
5. Create session (`sessions` table), set cookie `forum_session`
6. Middleware validates session + verifies MindAuth token (if present)

### Route Versioning
- Legacy routes: `/api/posts`, `/api/admin/*`
- v1 routes: `/api/v1/posts`, `/api/v1/users/*` (new features)
- Response header: `X-API-Version: 1` or `X-API-Version: legacy`
- Route modules use factory pattern: `createRoutes(prefix)` for versioning

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

### Frontend API Cache
- 30-second TTL for GET requests
- Cache invalidated on mutations (POST/PUT/DELETE)
- `clearCache()` called after create/update/delete operations

## Database Tables
- `users` - mindauth_id (unique), username, email, role, avatar_url, bio
- `sessions` - user_id, session_token, mindauth_token, expires_at
- `posts` - user_id, category_id, title, content/content_html, status, is_pinned, deleted_at
- `replies` - post_id, user_id, parent_reply_id (nested), content, status
- `categories`, `tags`, `post_tags` - Classification
- `bookmarks` - user_id, post_id (unique pair)
- `notifications` - user_id, type (reply/mention/message), actor_id, post_id/reply_id
- `messages` - Private messages (sender_id, recipient_id, soft delete flags)
- `attachments` - Files attached to posts/replies
- `resources` - Resource center files (user uploads, approval workflow)
- `operation_logs` - Admin action audit trail
- `settings` - Key-value config (categories: site, seo, announce, email, general)
- `bans` - IP/user blocking

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
1. Redirect: `${MINDAUTH_URL}/authorize?client_id=...&redirect_uri=...&state=...`
2. Callback: `/api/auth/callback?code=...&state=...`
3. Token exchange: POST `${MINDAUTH_URL}/api/token` → user info

### EasyManager (Server Management)
- `/api/server` routes provide forum integration for server listings
- Server data fetched from EasyManager API, displayed in forum pages