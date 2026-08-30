# MindFourm API 参考

> 由源码自动生成，覆盖后端全部 HTTP 接口（340 个端点）。
> 基础路径：`/api` · 响应统一包装为 `{ "success": true, "data": ... }`。

## 目录

1. [通用约定](#通用约定)
2. [机器人 / 服务端点总览](#机器人--服务端点总览)
3. [按模块索引](#按模块索引)

---

## 通用约定

### 认证方式

| 类型 | 徽标 | 说明 |
|---|---|---|
| 公开 | 🔓 | 无需认证 |
| 需登录 | 🔒 | 需 `forum_session` cookie（JWT 会话） |
| 角色 | 🔒 role | 需登录 + 指定角色（见角色层级） |
| 机器人 | 🤖 | **给机器人/第三方服务设计的端点**，用 API Key |
| 服务间 | 🛡 | 服务间认证（`X-Service-Key`），不面向终端用户 |

### 角色层级

```
guest(0) < user(1) < active_user(2) < core_user(3) < moderator(4) < admin(5) < super_admin(6)
```

### 响应格式

```json
{ "success": true, "data": ... }
{ "success": false, "message": "错误信息" }
```

分页接口返回 `{ data, pagination: { page, limit, total, totalPages } }`。

---

## 机器人 / 服务端点总览

> 本仓库为**机器人 / 第三方服务**设计的端点，供 QQ/Discord/Telegram 机器人、
> 外部平台、服务间回调等使用。共 **40** 个。

### A. External API（🤖 第三方机器人，API Key 认证）— 36 个

前缀 `/api/external/v1`，使用 `Authorization: Bearer` 或 `X-API-Key` 头携带 API Key，
按 scope 授权，可指定目标用户代发帖/回复，独立限流与审计。详见 `docs/api/external.md`。

| Method | Endpoint | Scope |
|--------|----------|-------|
| POST | `/api/auth/validate-credentials` | lanlink:auth, backupsave:auth |
| GET | `/api/external/v1/friends` | friends:read |
| GET | `/api/external/v1/friends/requests` | friends:read |
| GET | `/api/external/v1/users/search` | friends:read |
| POST | `/api/external/v1/lanlink/quick-code/validate` | lanlink:auth |
| GET | `/api/external/v1/lanlink/quick-code/users/:id` | lanlink:auth |
| POST | `/api/external/v1/notifications` | notifications:write |
| GET | `/api/external/v1/presence` | presence:read |
| PUT | `/api/external/v1/presence/:userId` | presence:write |
| DELETE | `/api/external/v1/presence/:userId` | presence:write |
| GET | `/api/external/v1/me` | - |
| POST | `/api/external/v1/images` | images:write |
| GET | `/api/external/v1/users/:id` | users:read |
| GET | `/api/external/v1/categories` | categories:read |
| GET | `/api/external/v1/tags` | tags:read |
| GET | `/api/external/v1/posts` | posts:read |
| GET | `/api/external/v1/posts/activity` | posts:read |
| POST | `/api/external/v1/posts` | posts:write |
| GET | `/api/external/v1/posts/:id` | posts:read |
| PATCH | `/api/external/v1/posts/:id` | posts:write |
| DELETE | `/api/external/v1/posts/:id` | posts:delete |
| GET | `/api/external/v1/posts/:id/replies` | replies:read |
| POST | `/api/external/v1/posts/:id/replies` | replies:write |
| GET | `/api/external/v1/replies/:id` | replies:read |
| PATCH | `/api/external/v1/replies/:id` | replies:write |
| DELETE | `/api/external/v1/replies/:id` | replies:delete |
| POST | `/api/external/v1/posts/:id/moderation` | posts:moderate |
| POST | `/api/external/v1/replies/:id/moderation` | replies:delete, posts:moderate |
| GET | `/api/external/v1/resources` | resources:read |
| GET | `/api/external/v1/resources/filter-options` | resources:read |
| POST | `/api/external/v1/resources` | resources:write |
| GET | `/api/external/v1/resources/categories` | resources:read |
| GET | `/api/external/v1/resources/:id` | resources:read |
| PATCH | `/api/external/v1/resources/:id` | resources:write |
| DELETE | `/api/external/v1/resources/:id` | resources:delete |
| POST | `/api/external/v1/resources/:id/moderation` | resources:moderate |

### B. Service API（🤖 机器人代发，论坛 API Key）— 2 个

前缀 `/api/service-api`，使用旧版 `FORUM_API_KEY`（被视为 `admin:* + users:impersonate`），
供机器人代发帖、代回复。

| Method | Endpoint | 说明 |
|--------|----------|------|
| POST | `/api/service-api/posts` | createPost |
| POST | `/api/service-api/posts/:postId/replies` | createReply |

### C. 服务间认证（🛡 X-Service-Key）— 2 个

用于受信服务间回调（如 EasyManager / 外部平台），头部携带 `X-Service-Key`。**不面向终端用户**。

| Method | Endpoint | 说明 |
|--------|----------|------|
| POST | `/api/auto-post/server-approved` | handleServerApproved |
| GET | `/api/post-servers/forum-posts/:serverId` | getForumPosts |

---

## 按模块索引

共 44 个模块。机器人/服务端点已在上节单列，此处按模块列出全部端点。


### admin

> 管理后台：仪表盘统计、批量操作、审核、标签合并、清理。

> 管理后台：仪表盘统计、批量操作、审核、标签合并、清理。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/admin/system/performance` | 🔒 admin | - |
| GET | `/api/admin/stats` | 🔒 moderator/admin | - |
| GET | `/api/admin/badge-counts` | 🔒 moderator/admin | - |
| GET | `/api/admin/settings` | 🔒 admin | - |
| GET | `/api/admin/settings/:category` | 🔒 admin | - |
| PUT | `/api/admin/settings/brand` | 🔒 admin | - |
| PUT | `/api/admin/settings/:category` | 🔒 admin | - |
| POST | `/api/admin/settings/brand/site-logo` | 🔒 admin | - |
| POST | `/api/admin/settings/brand/site-favicon` | 🔒 admin | - |
| POST | `/api/admin/settings/brand/sidebar-logo` | 🔒 admin | - |
| GET | `/api/admin/users` | 🔒 admin | - |
| PUT | `/api/admin/users/:id/role` | 🔒 admin | - |
| GET | `/api/admin/posts` | 🔒 moderator/admin | - |
| DELETE | `/api/admin/posts` | 🔒 moderator/admin | - |
| PUT | `/api/admin/posts/pin` | 🔒 moderator/admin | - |
| PUT | `/api/admin/posts/move` | 🔒 moderator/admin | - |
| PUT | `/api/admin/posts/:id/pin` | 🔒 moderator/admin | - |
| PUT | `/api/admin/posts/:id/move` | 🔒 moderator/admin | - |
| GET | `/api/admin/categories` | 🔒 admin | - |
| POST | `/api/admin/categories` | 🔒 admin | - |
| PUT | `/api/admin/categories/:id` | 🔒 admin | - |
| DELETE | `/api/admin/categories/:id` | 🔒 admin | - |
| GET | `/api/admin/tags` | 🔒 admin | - |
| POST | `/api/admin/tags` | 🔒 admin | - |
| PUT | `/api/admin/tags/:id` | 🔒 admin | - |
| DELETE | `/api/admin/tags/:id` | 🔒 admin | - |
| POST | `/api/admin/tags/merge` | 🔒 admin | - |
| GET | `/api/admin/moderation` | 🔒 moderator/admin | - |
| PUT | `/api/admin/moderation/:id/approve` | 🔒 moderator/admin | - |
| PUT | `/api/admin/moderation/:id/reject` | 🔒 moderator/admin | - |
| GET | `/api/admin/bans` | 🔒 admin | - |
| POST | `/api/admin/bans` | 🔒 admin | - |
| PUT | `/api/admin/bans/:id` | 🔒 admin | - |
| DELETE | `/api/admin/bans/:id` | 🔒 admin | - |
| POST | `/api/admin/cleanup/sessions` | 🔒 admin | - |
| POST | `/api/admin/cleanup/logs` | 🔒 admin | - |
| POST | `/api/admin/cleanup/soft-deleted` | 🔒 admin | - |
| GET | `/api/admin/logs` | 🔒 admin | - |
| GET | `/api/admin/system/rate-limit-observability` | 🔒 admin | - |

### admin-notifications

> 面向管理员的站内通知（SSE + webhook）。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/admin/notifications` | 🔒 需登录 | - |
| GET | `/api/admin/notifications/unread-count` | 🔒 需登录 | - |
| PUT | `/api/admin/notifications/:id/read` | 🔒 需登录 | - |
| PUT | `/api/admin/notifications/read-all` | 🔒 需登录 | - |

### attachments

> 文件上传。

> 文件上传。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| POST | `/api/attachments/upload` | 🔒 需登录 | - |
| POST | `/api/attachments/:id/approve` | 🔒 admin/moderator | - |
| POST | `/api/attachments/:id/reject` | 🔒 admin/moderator | - |
| GET | `/api/attachments/post/:postId` | 🔓 公开 | - |
| GET | `/api/attachments/reply/:replyId` | 🔓 公开 | - |
| GET | `/api/attachments/:id/download` | 🔓 公开 | - |
| GET | `/api/attachments/:id/preview` | 🔓 公开 | - |
| GET | `/api/attachments/:id/render-status` | 🔓 公开 | - |
| DELETE | `/api/attachments/:id` | 🔒 需登录 | - |

### auth

> 认证：MindAuth OAuth 回调、会话创建/校验/销毁、滑动续期。

> 认证：MindAuth OAuth 回调、会话创建/校验/销毁、滑动续期。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/auth/check` | 🔒 需登录 | - |
| POST | `/api/auth/sync-phone-status` | 🔒 需登录 | - |
| POST | `/api/auth/validate-credentials` | 🤖 机器人 | lanlink:auth, backupsave:auth |
| GET | `/api/auth/callback` | 🔒 需登录 | - |
| POST | `/api/auth/verify` | 🔒 需登录 | - |
| POST | `/api/auth/logout` | 🔒 需登录 | - |
| POST | `/api/auth/accept-terms` | 🔒 需登录 | - |
| POST | `/api/v1/auth/mobile/exchange` | 🔒 需登录 | - |
| POST | `/api/v1/auth/mobile/refresh` | 🔒 需登录 | - |
| POST | `/api/v1/auth/mobile/logout` | 🔒 需登录 | - |
| GET | `/api/v1/auth/mobile/sessions` | 🔒 需登录 | - |
| DELETE | `/api/v1/auth/mobile/sessions/:id` | 🔒 需登录 | - |
| POST | `/api/auth/test-login` | 🔒 需登录 | - |

### auto-post

> 保留的 EasyManager 回调处理器：服务批准后自动发布公告帖。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| POST | `/api/auto-post/server-approved` | 🛡 服务间 | - |

### badges

> 徽章定义与颁发。

> 徽章定义与颁发。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/badges` | 🔒 需登录 | - |
| GET | `/api/badges/user/:userId` | 🔒 需登录 | - |
| GET | `/api/badges/admin` | 🔒 admin | - |
| POST | `/api/badges/admin` | 🔒 admin | - |
| PUT | `/api/badges/admin/:id` | 🔒 admin | - |
| DELETE | `/api/badges/admin/:id` | 🔒 admin | - |
| POST | `/api/badges/admin/award` | 🔒 admin | - |

### bans

> 封禁管理（用户/IP/CIDR）。

> 封禁管理（用户/IP/CIDR）。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/bans` | 🔒 admin | - |
| POST | `/api/bans` | 🔒 admin | - |
| PUT | `/api/bans/:id` | 🔒 admin | - |
| DELETE | `/api/bans/:id` | 🔒 admin | - |

### bookmarks

> 书签 CRUD。

> 书签 CRUD。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/bookmarks` | 🔒 需登录 | - |
| GET | `/api/bookmarks/check/:postId` | 🔒 需登录 | - |
| POST | `/api/bookmarks/:postId` | 🔒 需登录 | - |
| DELETE | `/api/bookmarks/:postId` | 🔒 需登录 | - |

### capabilities

> 能力声明（客户端用）。

> 能力声明（客户端用）。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/v1/capabilities` | 🔒 需登录 | - |
| GET | `/api/v1/client/config` | 🔒 需登录 | - |

### categories

> 分类层级管理。

> 分类层级管理。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/categories` | 🔒 需登录 | - |
| GET | `/api/categories/:id` | 🔒 需登录 | - |
| GET | `/api/v1/categories` | 🔒 需登录 | - |

### discover

> 发现页。

> 发现页。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/v1/discover` | 🔒 需登录 | - |

### feedback

> 反馈。

> 反馈。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| POST | `/api/feedback` | 🔓 公开 | - |

### follows

> 用户关注。

> 用户关注。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| POST | `/api/follows/:userId` | 🔒 需登录 | - |
| DELETE | `/api/follows/:userId` | 🔒 需登录 | - |
| GET | `/api/follows/check/:userId` | 🔒 需登录 | - |
| GET | `/api/follows/user/:userId/followers` | 🔒 需登录 | - |
| GET | `/api/follows/user/:userId/following` | 🔒 需登录 | - |
| GET | `/api/follows/user/:userId/stats` | 🔒 需登录 | - |

### friends

> 好友系统：含外部机器人可调用的好友查询端点。

> 好友系统：含外部机器人可调用的好友查询端点。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/external/v1/friends` | 🤖 机器人 | friends:read |
| GET | `/api/external/v1/friends/requests` | 🤖 机器人 | friends:read |
| GET | `/api/external/v1/users/search` | 🤖 机器人 | friends:read |
| POST | `/api/friends/request/:userId` | 🔒 需登录 | - |
| POST | `/api/friends/accept/:userId` | 🔒 需登录 | - |
| POST | `/api/friends/reject/:userId` | 🔒 需登录 | - |
| POST | `/api/friends/cancel/:userId` | 🔒 需登录 | - |
| DELETE | `/api/friends/:userId` | 🔒 需登录 | - |
| GET | `/api/friends/requests` | 🔒 需登录 | - |
| GET | `/api/friends/search` | 🔒 需登录 | - |
| GET | `/api/friends/check/:userId` | 🔒 需登录 | - |
| GET | `/api/friends` | 🔒 需登录 | - |

### groups

> 群组 CRUD + 成员管理。

> 群组 CRUD + 成员管理。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/groups` | 🔒 需登录 | - |
| GET | `/api/groups/my` | 🔒 需登录 | - |
| GET | `/api/groups/admin` | 🔒 admin | - |
| POST | `/api/groups/admin` | 🔒 admin | - |
| PUT | `/api/groups/admin/:id` | 🔒 admin | - |
| DELETE | `/api/groups/admin/:id` | 🔒 admin | - |
| POST | `/api/groups/admin/:id/members` | 🔒 admin | - |
| DELETE | `/api/groups/admin/:id/members/:userId` | 🔒 admin | - |
| POST | `/api/groups/:id/join` | 🔒 需登录 | - |
| POST | `/api/groups/:id/leave` | 🔒 需登录 | - |
| GET | `/api/groups/:slug` | 🔒 需登录 | - |
| GET | `/api/groups/:slug/members` | 🔒 需登录 | - |

### lanlink

> LANLink 快速代码：8 字符临时码生成/校验，用于局域网设备授权登录。

> LANLink 快速代码：8 字符临时码生成/校验，用于局域网设备授权登录。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/lanlink/quick-code` | 🔒 需登录 | - |
| POST | `/api/lanlink/quick-code` | 🔒 需登录 | - |
| DELETE | `/api/lanlink/quick-code` | 🔒 需登录 | - |
| POST | `/api/external/v1/lanlink/quick-code/validate` | 🤖 机器人 | lanlink:auth |
| GET | `/api/external/v1/lanlink/quick-code/users/:id` | 🤖 机器人 | lanlink:auth |

### levels

> 等级体系。

> 等级体系。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/levels` | 🔒 需登录 | - |
| GET | `/api/levels/user/:userId` | 🔒 需登录 | - |
| GET | `/api/levels/admin` | 🔒 admin | - |
| POST | `/api/levels/admin` | 🔒 admin | - |
| PUT | `/api/levels/admin/:id` | 🔒 admin | - |
| DELETE | `/api/levels/admin/:id` | 🔒 admin | - |

### likes

> 帖子/回复点赞。

> 帖子/回复点赞。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| POST | `/api/likes/posts/:postId` | 🔒 需登录 | - |
| DELETE | `/api/likes/posts/:postId` | 🔒 需登录 | - |
| GET | `/api/likes/posts/:postId` | 🔒 需登录 | - |
| GET | `/api/likes/posts` | 🔒 需登录 | - |
| POST | `/api/likes/replies/:replyId` | 🔒 需登录 | - |
| DELETE | `/api/likes/replies/:replyId` | 🔒 需登录 | - |
| GET | `/api/likes/replies/:replyId` | 🔒 需登录 | - |
| GET | `/api/likes/users/:userId/count` | 🔓 公开 | - |

### messages

> 私信 + 游标分页。

> 私信 + 游标分页。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| POST | `/api/messages` | 🔒 需登录 | - |
| GET | `/api/messages` | 🔒 需登录 | - |
| GET | `/api/messages/unread-count` | 🔒 需登录 | - |
| GET | `/api/messages/:userId` | 🔒 需登录 | - |
| DELETE | `/api/messages/:id` | 🔒 需登录 | - |
| POST | `/api/group-chats` | 🔒 需登录 | - |
| GET | `/api/group-chats` | 🔒 需登录 | - |
| GET | `/api/group-chats/:id` | 🔒 需登录 | - |
| GET | `/api/group-chats/:id/messages` | 🔒 需登录 | - |
| POST | `/api/group-chats/:id/messages` | 🔒 需登录 | - |
| POST | `/api/group-chats/:id/members` | 🔒 需登录 | - |
| DELETE | `/api/group-chats/:id/members/:userId` | 🔒 需登录 | - |
| POST | `/api/group-chats/:id/leave` | 🔒 需登录 | - |
| PUT | `/api/group-chats/:id` | 🔒 需登录 | - |

### notices

> 公告内容。

> 公告内容。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/v1/notices` | 🔒 需登录 | - |
| GET | `/api/v1/notices/:id` | 🔒 需登录 | - |
| GET | `/api/v1/admin/notices` | 🔒 需登录 | - |
| POST | `/api/v1/admin/notices` | 🔒 需登录 | - |
| PATCH | `/api/v1/admin/notices/:id` | 🔒 需登录 | - |
| DELETE | `/api/v1/admin/notices/:id` | 🔒 需登录 | - |

### notifications

> 站内通知（5 类）+ SSE + 邮件。

> 站内通知（5 类）+ SSE + 邮件。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/notifications` | 🔒 需登录 | - |
| GET | `/api/notifications/cursor` | 🔒 需登录 | - |
| GET | `/api/notifications/unread-count` | 🔒 需登录 | - |
| PUT | `/api/notifications/:id/read` | 🔒 需登录 | - |
| PUT | `/api/notifications/read-all` | 🔒 需登录 | - |
| GET | `/api/notifications/email-preference` | 🔒 需登录 | - |
| PUT | `/api/notifications/email-preference` | 🔒 需登录 | - |

### plugins

> 插件生命周期管理。

> 插件生命周期管理。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/plugins` | 🔒 需登录 | - |
| GET | `/api/plugins/:slug` | 🔒 需登录 | - |
| POST | `/api/plugins/install` | 🔒 需登录 | - |
| DELETE | `/api/plugins/:slug` | 🔒 需登录 | - |
| POST | `/api/plugins/:slug/enable` | 🔒 需登录 | - |
| POST | `/api/plugins/:slug/disable` | 🔒 需登录 | - |
| GET | `/api/plugins/:slug/config` | 🔒 需登录 | - |
| PUT | `/api/plugins/:slug/config` | 🔒 需登录 | - |
| GET | `/api/plugins/:slug/hooks` | 🔒 需登录 | - |

### points

> 积分系统。

> 积分系统。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/points/me` | 🔒 需登录 | - |
| GET | `/api/points/me/history` | 🔒 需登录 | - |
| GET | `/api/points/leaderboard` | 🔒 需登录 | - |
| GET | `/api/points/rules` | 🔒 需登录 | - |
| GET | `/api/points/admin/rules` | 🔒 admin | - |
| POST | `/api/points/admin/rules` | 🔒 admin | - |
| PUT | `/api/points/admin/rules/:id` | 🔒 admin | - |
| DELETE | `/api/points/admin/rules/:id` | 🔒 admin | - |
| POST | `/api/points/admin/award` | 🔒 admin | - |

### portal

> 门户 V1。

> 门户 V1。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/v1/portal` | 🔒 需登录 | - |

### post-servers

> 帖子与服务器关联（EasyManager 集成预留）。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/post-servers/by-server/:serverId` | 🔓 公开 | - |
| GET | `/api/post-servers/forum-posts/:serverId` | 🛡 服务间 | - |
| POST | `/api/post-servers/link` | 🔒 需登录 | - |
| DELETE | `/api/post-servers/:postId/server` | 🔒 需登录 | - |

### posts

> 帖子 CRUD、Markdown、标签、游标分页、搜索。

> 帖子 CRUD、Markdown、标签、游标分页、搜索。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/posts` | 🔒 需登录 | - |
| GET | `/api/posts/cursor` | 🔒 需登录 | - |
| GET | `/api/posts/trending` | 🔒 需登录 | - |
| GET | `/api/posts/pinned` | 🔒 需登录 | - |
| GET | `/api/posts/search` | 🔒 需登录 | - |
| GET | `/api/posts/:id` | 🔒 需登录 | - |
| POST | `/api/posts` | 🔒 需登录 | - |
| PUT | `/api/posts/:id` | 🔒 需登录 | - |
| DELETE | `/api/posts/:id` | 🔒 需登录 | - |
| PUT | `/api/posts/:id/pin` | 🔒 admin/moderator | - |
| PUT | `/api/posts/:id/lock` | 🔒 admin/moderator | - |
| PUT | `/api/posts/:id/best-reply` | 🔒 需登录 | - |
| GET | `/api/posts/:id/revisions` | 🔒 需登录 | - |
| GET | `/api/posts/:id/revisions/:revisionId` | 🔒 需登录 | - |
| PUT | `/api/posts/:id/move` | 🔒 admin/moderator | - |
| GET | `/api/posts/user/:userId` | 🔒 需登录 | - |

### presence

> 在线状态：Redis 驱动，含外部机器人在线状态读写。

> 在线状态：Redis 驱动，含外部机器人在线状态读写。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| POST | `/api/external/v1/notifications` | 🤖 机器人 | notifications:write |
| GET | `/api/external/v1/presence` | 🤖 机器人 | presence:read |
| PUT | `/api/external/v1/presence/:userId` | 🤖 机器人 | presence:write |
| DELETE | `/api/external/v1/presence/:userId` | 🤖 机器人 | presence:write |
| GET | `/api/presence/staff` | 🔓 公开 | - |
| GET | `/api/presence` | 🔒 需登录 | - |

### privacy

> 隐私相关。

> 隐私相关。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/admin/privacy/deletion-requests` | 🔒 需登录 | - |
| PUT | `/api/admin/privacy/deletion-requests/:id` | 🔒 需登录 | - |
| POST | `/api/admin/privacy/retention-sweep` | 🔒 需登录 | - |
| POST | `/api/privacy/deletion-requests` | 🔒 需登录 | - |
| GET | `/api/privacy/deletion-requests/me` | 🔒 需登录 | - |

### reactions

> 表情回应（白名单 emoji）。

> 表情回应（白名单 emoji）。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/reactions/emojis` | 🔓 公开 | - |
| POST | `/api/reactions/:targetType/:targetId` | 🔒 需登录 | - |
| GET | `/api/reactions/:targetType/:targetId` | 🔒 需登录 | - |

### replies

> 回复管理、@提及解析、软删除。

> 回复管理、@提及解析、软删除。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/posts/:postId/replies` | 🔒 需登录 | - |
| POST | `/api/posts/:postId/replies` | 🔒 需登录 | - |
| GET | `/api/replies/:id` | 🔒 需登录 | - |
| PUT | `/api/replies/:id` | 🔒 需登录 | - |
| DELETE | `/api/replies/:id` | 🔒 需登录 | - |

### reports

> 举报/审核队列。

> 举报/审核队列。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/admin/reports` | 🔒 moderator/admin | - |
| PATCH | `/api/admin/reports/:id` | 🔒 moderator/admin | - |
| POST | `/api/reports` | 🔒 需登录 | - |
| GET | `/api/reports/mine` | 🔒 需登录 | - |

### resources

> 资源中心：上传/外链、版本管理、分类、审核。

> 资源中心：上传/外链、版本管理、分类、审核。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/resources` | 🔒 需登录 | - |
| GET | `/api/resources/hot` | 🔒 需登录 | - |
| GET | `/api/resources/filter-options` | 🔒 需登录 | - |
| GET | `/api/resources/user/:userId` | 🔒 需登录 | - |
| GET | `/api/resources/categories` | 🔒 需登录 | - |
| GET | `/api/resources/categories/tree` | 🔒 需登录 | - |
| GET | `/api/resources/categories/admin` | 🔒 admin | - |
| POST | `/api/resources/categories` | 🔒 admin | - |
| PUT | `/api/resources/categories/:categoryId` | 🔒 admin | - |
| DELETE | `/api/resources/categories/:categoryId` | 🔒 admin | - |
| GET | `/api/resources/admin` | 🔒 admin/moderator | - |
| GET | `/api/resources/my` | 🔒 需登录 | - |
| GET | `/api/resources/:id` | 🔒 需登录 | - |
| GET | `/api/resources/:id/related` | 🔒 需登录 | - |
| GET | `/api/resources/:id/download` | 🔒 需登录 | - |
| GET | `/api/resources/:id/versions` | 🔒 需登录 | - |
| POST | `/api/resources` | 🔒 需登录 | - |
| PUT | `/api/resources/:id` | 🔒 需登录 | - |
| DELETE | `/api/resources/:id` | 🔒 需登录 | - |
| POST | `/api/resources/:id/versions` | 🔒 需登录 | - |
| DELETE | `/api/resources/:id/versions/:versionId` | 🔒 需登录 | - |
| PUT | `/api/resources/:id/status` | 🔒 admin/moderator | - |
| DELETE | `/api/resources/:id/admin` | 🔒 admin/moderator | - |
| POST | `/api/resources/admin/cleanup-storage` | 🔒 admin | - |
| POST | `/api/resources/:id/rating` | 🔒 需登录 | - |
| DELETE | `/api/resources/:id/rating` | 🔒 需登录 | - |
| GET | `/api/resources/:id/rating` | 🔒 需登录 | - |
| GET | `/api/resources/:id/favorite` | 🔒 需登录 | - |
| POST | `/api/resources/:id/favorite` | 🔒 需登录 | - |
| DELETE | `/api/resources/:id/favorite` | 🔒 需登录 | - |
| GET | `/api/resources/:id/subscription` | 🔒 需登录 | - |
| POST | `/api/resources/:id/subscription` | 🔒 需登录 | - |
| DELETE | `/api/resources/:id/subscription` | 🔒 需登录 | - |
| GET | `/api/v1/resources/:id` | 🔒 需登录 | - |

### rss

> RSS 2.0 订阅源。

> RSS 2.0 订阅源。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/rss/posts.xml` | 🔒 需登录 | - |
| GET | `/api/rss/categories/:slug.xml` | 🔒 需登录 | - |

### search

> 搜索：LIKE + 热门搜索缓存。

> 搜索：LIKE + 热门搜索缓存。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/search` | 🔒 需登录 | - |
| GET | `/api/search/history` | 🔒 需登录 | - |
| DELETE | `/api/search/history` | 🔒 需登录 | - |
| GET | `/api/search/popular` | 🔒 需登录 | - |
| GET | `/api/v1/search/posts` | 🔒 需登录 | - |

### security

> 安全设置。

> 安全设置。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| POST | `/api/security/csp-reports` | 🔓 公开 | - |

### servers

> 服务器（暂停中的 EasyManager 代理）。

> 服务器（暂停中的 EasyManager 代理）。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/servers/public` | 🔒 需登录 | - |
| GET | `/api/servers/versions` | 🔒 需登录 | - |
| GET | `/api/servers/templates` | 🔒 需登录 | - |
| GET | `/api/servers/:id/basic` | 🔒 需登录 | - |
| GET | `/api/servers/my` | 🔒 需登录 | - |
| POST | `/api/servers/apply` | 🔒 需登录 | - |

### service-api

> External API 平台：第三方机器人/服务以 API Key 调用，可代发帖/回复、审核和管理资源，独立 scope 与审计。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/admin/external-api/keys` | 🔒 需登录 | - |
| POST | `/api/admin/external-api/keys` | 🔒 需登录 | - |
| PATCH | `/api/admin/external-api/keys/:id` | 🔒 需登录 | - |
| POST | `/api/admin/external-api/keys/:id/rotate` | 🔒 需登录 | - |
| POST | `/api/admin/external-api/keys/:id/enable` | 🔒 需登录 | - |
| POST | `/api/admin/external-api/keys/:id/disable` | 🔒 需登录 | - |
| GET | `/api/admin/external-api/audit-logs` | 🔒 需登录 | - |
| GET | `/api/external/v1/me` | 🤖 机器人 | - |
| POST | `/api/external/v1/images` | 🤖 机器人 | images:write |
| GET | `/api/external/v1/users/:id` | 🤖 机器人 | users:read |
| GET | `/api/external/v1/categories` | 🤖 机器人 | categories:read |
| GET | `/api/external/v1/tags` | 🤖 机器人 | tags:read |
| GET | `/api/external/v1/posts` | 🤖 机器人 | posts:read |
| GET | `/api/external/v1/posts/activity` | 🤖 机器人 | posts:read |
| POST | `/api/external/v1/posts` | 🤖 机器人 | posts:write |
| GET | `/api/external/v1/posts/:id` | 🤖 机器人 | posts:read |
| PATCH | `/api/external/v1/posts/:id` | 🤖 机器人 | posts:write |
| DELETE | `/api/external/v1/posts/:id` | 🤖 机器人 | posts:delete |
| GET | `/api/external/v1/posts/:id/replies` | 🤖 机器人 | replies:read |
| POST | `/api/external/v1/posts/:id/replies` | 🤖 机器人 | replies:write |
| GET | `/api/external/v1/replies/:id` | 🤖 机器人 | replies:read |
| PATCH | `/api/external/v1/replies/:id` | 🤖 机器人 | replies:write |
| DELETE | `/api/external/v1/replies/:id` | 🤖 机器人 | replies:delete |
| POST | `/api/external/v1/posts/:id/moderation` | 🤖 机器人 | posts:moderate |
| POST | `/api/external/v1/replies/:id/moderation` | 🤖 机器人 | replies:delete, posts:moderate |
| GET | `/api/external/v1/resources` | 🤖 机器人 | resources:read |
| GET | `/api/external/v1/resources/filter-options` | 🤖 机器人 | resources:read |
| POST | `/api/external/v1/resources` | 🤖 机器人 | resources:write |
| GET | `/api/external/v1/resources/categories` | 🤖 机器人 | resources:read |
| GET | `/api/external/v1/resources/:id` | 🤖 机器人 | resources:read |
| PATCH | `/api/external/v1/resources/:id` | 🤖 机器人 | resources:write |
| DELETE | `/api/external/v1/resources/:id` | 🤖 机器人 | resources:delete |
| POST | `/api/external/v1/resources/:id/moderation` | 🤖 机器人 | resources:moderate |
| POST | `/api/service-api/posts` | 🤖 机器人 | - |
| POST | `/api/service-api/posts/:postId/replies` | 🤖 机器人 | - |

### settings

> 键值设置。

> 键值设置。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/settings` | 🔓 公开 | - |
| GET | `/api/settings/admin/sidebar-navigation` | 🔒 admin | - |
| PUT | `/api/settings/admin/sidebar-navigation` | 🔒 admin | - |
| GET | `/api/settings/:category` | 🔓 公开 | - |
| PUT | `/api/settings/brand` | 🔒 admin | - |
| PUT | `/api/settings/:category` | 🔒 admin | - |

### shop

> 积分商城（原子扣库存+扣分）。

> 积分商城（原子扣库存+扣分）。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/shop/items` | 🔒 需登录 | - |
| GET | `/api/shop/items/:id` | 🔒 需登录 | - |
| POST | `/api/shop/purchase/:itemId` | 🔒 需登录 | - |
| GET | `/api/shop/me/purchases` | 🔒 需登录 | - |
| GET | `/api/shop/admin/items` | 🔒 admin | - |
| POST | `/api/shop/admin/items` | 🔒 admin | - |
| PUT | `/api/shop/admin/items/:id` | 🔒 admin | - |
| DELETE | `/api/shop/admin/items/:id` | 🔒 admin | - |

### stats

> 仪表盘统计。

> 仪表盘统计。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/stats/overview` | 🔒 需登录 | - |

### tags

> 标签 CRUD、自动 slug、合并。

> 标签 CRUD、自动 slug、合并。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/tags` | 🔒 需登录 | - |
| GET | `/api/tags/:slug/posts` | 🔒 需登录 | - |
| GET | `/api/v1/tags` | 🔒 需登录 | - |

### threads

> 话题 V1。

> 话题 V1。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/v1/threads` | 🔒 需登录 | - |
| GET | `/api/v1/threads/:id` | 🔒 需登录 | - |

### user-blocks

> 用户间屏蔽。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| POST | `/api/user-blocks` | 🔒 需登录 | - |
| DELETE | `/api/user-blocks/:blockedId` | 🔒 需登录 | - |
| GET | `/api/user-blocks` | 🔒 需登录 | - |

### users

> 用户资料、头像、角色管理。

> 用户资料、头像、角色管理。

| Method | Endpoint | 认证 | 角色 |
|--------|---------|------|------|
| GET | `/api/users/me` | 🔒 需登录 | - |
| PUT | `/api/users/me/profile` | 🔒 需登录 | - |
| POST | `/api/users/me/avatar` | 🔒 需登录 | - |
| DELETE | `/api/users/me/avatar` | 🔒 需登录 | - |
| GET | `/api/users/me/replies` | 🔒 需登录 | - |
| GET | `/api/users/search` | 🔒 需登录 | - |
| GET | `/api/users/:id` | 🔒 需登录 | - |
| GET | `/api/users/:id/replies` | 🔒 需登录 | - |

---
*由 CodeBuddy 基于源码自动生成 · 2026-08-30*
