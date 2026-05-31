# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in the MindFourm service.

## Project Overview

MindFourm is a forum system for the Mindustry community, integrated with:
- **MindAuth**: OAuth SSO login
- **EasyManager**: Server listings and applications

Features include:
- Posts and replies with Markdown support
- Categories and tags
- Bookmarks and notifications
- Private messages
- Resource center (downloads)
- Admin panel with moderation tools

## Commands

```bash
# Backend (Port 4000)
cd MindFourm && npm run dev

# Frontend (Port 3000)
cd MindFourm/frontend && npm run dev

# E2E Tests
cd MindFourm && npx playwright test
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Next.js Frontend (Port 3000)                          │
│  App Router: (public), (auth), admin route groups                          │
│  Components: forum/, admin/, ui/                                            │
└──────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      Koa Backend (Port 4000)                               │
│  src/app.js - Main entry                                                   │
│  src/routes/ - 16 route modules                                             │
│  src/controllers/ - Request handling                                        │
│  src/services/ - Business logic                                             │
└──────────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         ┌─────────┐    ┌─────────┐    ┌────────────┐
         │  MySQL  │    │  Redis  │    │  MindAuth  │
         │ Posts   │    │ Session │    │  OAuth     │
         │ Users   │    │ Cache   │    │            │
         └─────────┘    └─────────┘    └────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  EasyManager    │
                    │  Server API     │
                    └─────────────────┘
```

## Backend Structure (`src/`)

### Routes (`src/routes/`)
| Module | Prefix | Description |
|--------|--------|-------------|
| `auth.routes.js` | `/api/auth` | OAuth callback, session |
| `post.routes.js` | `/api/posts`, `/api/v1/posts` | Posts CRUD |
| `reply.routes.js` | `/api/v1/replies` | Replies CRUD |
| `category.routes.js` | `/api/categories` | Category listing |
| `tag.routes.js` | `/api/tags` | Tag listing |
| `user.routes.js` | `/api/v1/users` | User profiles |
| `bookmark.routes.js` | `/api/v1/bookmarks` | Bookmarks |
| `notification.routes.js` | `/api/v1/notifications` | Notifications |
| `message.routes.js` | `/api/v1/messages` | Private messages |
| `attachment.routes.js` | `/api/v1/attachments` | File uploads |
| `resource.routes.js` | `/api/v1/resources` | Resource center |
| `server.routes.js` | `/api/servers` | EasyManager proxy |
| `post-server.routes.js` | `/api/v1/post-servers` | Post-server relations |
| `auto-post.routes.js` | `/api/auto-post` | EasyManager callback |
| `admin.routes.js` | `/api/admin`, `/api/v1/admin` | Admin panel |

### Controllers (`src/controllers/`)
Handle request parsing, validation, and response formatting.

### Services (`src/services/`)
| Service | Purpose |
|---------|---------|
| `auth.service.js` | MindAuth OAuth integration |
| `post.service.js` | Post CRUD, search, pagination |
| `reply.service.js` | Reply management |
| `user.service.js` | User profiles, search |
| `bookmark.service.js` | Bookmark management |
| `notification.service.js` | Notification creation/delivery |
| `message.service.js` | Private messages |
| `server.service.js` | EasyManager API proxy |
| `resource.service.js` | Resource uploads/downloads |
| `ban.service.js` | User/content banning |
| `setting.service.js` | System settings |
| `stat.service.js` | Statistics |

### Middleware (`src/middleware/`)
| Middleware | Purpose |
|------------|---------|
| `auth.js` | Session validation |
| `ban-check.js` | Banned user check |
| `permission.js` | Role-based access |
| `rate-limit.js` | Request throttling |
| `service-auth.js` | Service-to-service auth (X-Service-Key) |
| `upload.js` | File upload handling |
| `validate.js` | Request validation (Joi) |

## API Endpoints

### Posts (`/api/posts`, `/api/v1/posts`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Post list (pagination) |
| GET | `/cursor` | Post list (cursor pagination) |
| GET | `/:id` | Post detail |
| POST | `/` | Create post |
| PUT | `/:id` | Update post |
| DELETE | `/:id` | Delete post |

### Replies (`/api/v1/replies`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:postId/replies` | Reply list |
| POST | `/:postId/replies` | Create reply |
| PUT | `/:id` | Update reply |
| DELETE | `/:id` | Delete reply |

### Users (`/api/v1/users`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/me` | Current user |
| PUT | `/me/profile` | Update profile |
| POST | `/me/avatar` | Upload avatar |
| GET | `/search` | Search users (@mentions) |
| GET | `/:id` | User public info |

### Notifications (`/api/v1/notifications`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Notification list |
| GET | `/unread-count` | Unread count |
| PUT | `/:id/read` | Mark read |
| PUT | `/read-all` | Mark all read |

### Resources (`/api/v1/resources`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Resource list |
| GET | `/:id` | Resource detail |
| GET | `/:id/download` | Download file |
| POST | `/` | Upload resource |
| PUT | `/:id/status` | Update status (admin) |

### Servers (`/api/servers`) - EasyManager Proxy
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/public` | Public server list |
| GET | `/my` | User's servers |
| POST | `/apply` | Apply for server |

### Admin (`/api/admin`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Statistics |
| GET/PUT | `/settings/:category` | Settings management |
| GET | `/users` | User list |
| PUT | `/users/:id/role` | Update role |
| GET/DELETE | `/posts` | Post management |
| PUT | `/posts/pin` | Pin posts |
| POST/DELETE | `/categories` | Category CRUD |
| GET/POST/DELETE | `/tags` | Tag management |
| GET/PUT | `/bans` | Ban management |
| GET | `/logs` | Operation logs |

## Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | User accounts | mindauth_id, username, email, role, avatar_url |
| `posts` | Forum posts | user_id, category_id, server_id, title, content, status, is_pinned |
| `replies` | Post replies | post_id, user_id, parent_reply_id, content |
| `categories` | Post categories | name, slug, sort_order |
| `tags` | Post tags | name, slug |
| `post_tags` | Post-tag relation | post_id, tag_id |
| `bookmarks` | User bookmarks | user_id, post_id |
| `notifications` | User notifications | user_id, type, actor_id, is_read |
| `messages` | Private messages | sender_id, recipient_id, is_read |
| `attachments` | File attachments | post_id, user_id, file_path |
| `resources` | Resource center | user_id, title, resource_type, status |
| `settings` | System settings (KV) | key, value, category |
| `bans` | Ban records | ban_type, value, reason |
| `operation_logs` | Admin logs | user_id, action, target_type |

## Frontend Structure (`frontend/`)

### App Router Pages (`frontend/src/app/`)
| Route Group | Pages |
|-------------|-------|
| `(public)` | `/`, `/posts/:id`, `/categories/:slug`, `/tags/:slug`, `/search`, `/users/:id`, `/resources`, `/servers` |
| `(auth)` | `/login`, `/register`, `/callback`, `/posts/new`, `/messages`, `/notifications`, `/users/me`, `/apply/server` |
| `admin` | `/admin`, `/admin/settings/*`, `/admin/posts`, `/admin/categories`, `/admin/users`, `/admin/logs`, `/admin/resources/*` |

### Components (`frontend/src/components/`)
| Directory | Components |
|-----------|------------|
| `forum/` | PostCard, PostList, ReplyList, CategoryNav, TagList |
| `admin/` | AdminHeader, AdminStats, UserTable, PostTable |
| `ui/` | shadcn/ui components (button, card, dialog, tabs, etc.) |

### Lib (`frontend/src/lib/`)
| File | Purpose |
|------|---------|
| `api/client.ts` | API request wrapper |
| `auth/context.tsx` | Auth context provider |
| `settings/context.tsx` | Settings context |
| `toast/context.tsx` | Toast notifications |
| `utils.ts` | Utility functions |

## MindAuth Integration

### OAuth Flow
```
1. User clicks login → Redirect to MindAuth /login
2. MindAuth redirects to /api/auth/callback?code=XYZ
3. Backend exchanges code for access_token
4. Backend gets userinfo from MindAuth
5. Create/update local user by mindauth_id
6. Create forum session, set cookie
```

### Environment Variables
| Variable | Description |
|----------|-------------|
| `MINDAUTH_URL` | MindAuth service URL |
| `MINDAUTH_CLIENT_ID` | OAuth client ID |
| `MINDAUTH_CLIENT_SECRET` | OAuth client secret |
| `MINDAUTH_CALLBACK_URL` | Callback URL |

## EasyManager Integration

### Server Listing
| Endpoint | Purpose |
|----------|---------|
| `GET /api/forum/servers/public` | Public servers |
| `GET /api/forum/user/:mindauthId/servers` | User's servers |
| `POST /api/forum/apply` | Server application |
| `GET /api/forum/servers/:id/basic` | Server info |

### Callback Reception
| Endpoint | Purpose |
|----------|---------|
| `POST /api/auto-post/server-approved` | Auto-create post when server approved |

### Environment Variables
| Variable | Description |
|----------|-------------|
| `EASYMANAGER_URL` | EasyManager API URL |
| `EASYMANAGER_API_KEY` | Service authentication key |

## Environment Setup (`MindFourm/.env`)

```bash
PORT=4000
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:4000

# Database
MYSQL_HOST=localhost
MYSQL_DATABASE=mindforum
REDIS_HOST=localhost

# MindAuth OAuth
MINDAUTH_URL=http://localhost:4001
MINDAUTH_CLIENT_ID=forum
MINDAUTH_CLIENT_SECRET=<secret>

# EasyManager
EASYMANAGER_URL=http://localhost:5001
EASYMANAGER_API_KEY=<key>
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Backend | Koa 2.x, MySQL 2, ioredis |
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS, shadcn/ui |
| Animation | Framer Motion |
| Validation | Joi |
| Markdown | Marked + React Markdown |

---
*Last updated: 2026-05-31*