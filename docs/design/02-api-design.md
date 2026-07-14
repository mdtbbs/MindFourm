# API 接口设计

> 本文档记录了 MindFourm NestJS 后端的实际 API 接口实现。
> 创建时间: 2026-06-07
> 更新时间: 2026-06-08

## 技术架构

| 项目 | 实现 |
|------|------|
| 后端框架 | NestJS + TypeScript |
| 协议 | RESTful API |
| 全局前缀 | `/api` |
| 认证 | MindAuth OAuth + JWT Session (HttpOnly Cookie) |
| 验证 | class-validator + ValidationPipe |
| 响应拦截 | ResponseInterceptor (统一响应格式) |
| 异常过滤 | AllExceptionsFilter (统一错误格式) |

---

## 全局配置

### main.ts 核心配置

```typescript
// 全局 API 前缀
app.setGlobalPrefix('api');

// 全局验证管道
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,           // 自动移除未定义属性
    forbidNonWhitelisted: true, // 拒绝未定义属性
    transform: true,           // 自动类型转换
    transformOptions: { enableImplicitConversion: true },
  }),
);

// 全局响应拦截器
app.useGlobalInterceptors(new ResponseInterceptor());

// 全局异常过滤器
app.useGlobalFilters(new AllExceptionsFilter());
```

---

## 响应格式

### 成功响应

所有成功响应由 `ResponseInterceptor` 自动包装:

```json
{
  "success": true,
  "data": { ... }
}
```

### 错误响应

所有异常由 `AllExceptionsFilter` 统一处理:

```json
{
  "success": false,
  "message": "错误描述"
}
```

HTTP 状态码由异常类型决定:
- `HttpException`: 使用异常自带状态码
- 未处理异常: 500 Internal Server Error

---

## 认证机制

### 会话验证流程

1. **Cookie 存储**: JWT session token 存储在 HttpOnly cookie (`forum_session`)
2. **Guard 验证**: `JwtAuthGuard` 从 cookie 或 Authorization header 提取 token
3. **Redis 查询**: `AuthService.verifySession()` 查询 Redis 验证会话有效性
4. **用户注入**: 验证成功后 `req.user` 包含完整用户信息

### 认证装饰器

| 述器 | 用途 | 示例 |
|--------|------|------|
| `@UseGuards(JwtAuthGuard)` | 要求用户登录 | 所有需认证的接口 |
| `@Public()` | 公开接口，跳过认证 | 列表、详情、下载等 |
| `@Roles('admin', 'moderator')` | 角色权限控制 | 管理后台接口 |

### Guards 层级

```
JwtAuthGuard (认证)
    ↓
RolesGuard (角色)
    ↓
ServiceAuthGuard (服务间认证)
```

### 服务间认证

`ServiceAuthGuard` 验证 `X-Service-Key` header:
- 用于 EasyManager 回调接口 (`/api/auto-post/*`)
- 配置项: `EASYMANAGER_API_KEY`

---

## API 端点总览

### 认证模块 `/api/auth`

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/check` | Public | 检查当前登录状态 |
| GET | `/callback` | Public | OAuth 回调 (code → session) |
| POST | `/verify` | Public | 验证 session token (服务间) |
| POST | `/logout` | Cookie | 登出并销毁会话 |

#### GET `/api/auth/check`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "user": {
      "id": 1,
      "mindauth_id": "abc123",
      "username": "testuser",
      "email": "test@example.com",
      "avatar_url": "/uploads/avatar.png",
      "role": "user",
      "bio": "简介",
      "created_at": "2026-06-01T00:00:00Z"
    }
  }
}
```

未登录时:
```json
{
  "success": true,
  "data": { "authenticated": false }
}
```

#### GET `/api/auth/callback`

OAuth 流程:
1. MindAuth 重定向至此，携带 `code` 和 `state`
2. 后端用 code 换取 access_token
3. 获取 MindAuth 用户信息
4. 创建/更新本地用户
5. 创建 Redis session，设置 cookie
6. 重定向到前端

**Query 参数**:
- `code` (必填): OAuth authorization code
- `state` (可选): OAuth state

**响应**: 302 重定向到 `FRONTEND_URL`

#### POST `/api/auth/verify`

服务间验证接口，用于 MindAuth 或其他服务验证 session。

**请求体**:
```json
{
  "session_token": "forum_session_cookie_value"
}
```

**响应**:
```json
{
  "valid": true,
  "user": { ... }
}
```

---

### 帖子模块 `/api/posts`

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/` | Public | 帖子列表 (offset 分页) |
| GET | `/cursor` | Public | 帖子列表 (cursor 分页) |
| GET | `/trending` | Public | 热门帖子 |
| GET | `/pinned` | Public | 置顶帖子 |
| GET | `/search` | Public | 搜索帖子 |
| GET | `/:id` | Public | 帖子详情 (含回复分页) |
| POST | `/` | JwtAuthGuard | 创建帖子 |
| PUT | `/:id` | JwtAuthGuard | 更新帖子 (作者或管理员) |
| DELETE | `/:id` | JwtAuthGuard | 删除帖子 (软删除) |
| PUT | `/:id/pin` | Roles(admin,mod) | 置顶/取消置顶 |
| PUT | `/:id/move` | Roles(admin,mod) | 移动分类 |
| GET | `/user/:userId` | Public | 用户帖子列表 |

#### GET `/api/posts` (Offset 分页)

**Query 参数** (QueryPostsDto):
- `page` (可选, 默认 1): 页码
- `limit` (可选, 默认 20): 每页数量
- `category_id` (可选): 分类 ID
- `status` (可选): 状态筛选
- `sort` (可选): 排序方式

**响应**:
```json
{
  "success": true,
  "data": {
    "data": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

#### GET `/api/posts/cursor` (Cursor 分页)

**Query 参数**:
- `cursor` (可选): 游标 (帖子 ID)
- `limit` (可选, 默认 20): 每页数量
- 其他筛选参数同 offset 分页

**响应**:
```json
{
  "success": true,
  "data": {
    "data": [...],
    "nextCursor": 42
  }
}
```

#### POST `/api/posts`

**请求体** (CreatePostDto):
```json
{
  "title": "帖子标题",
  "content": "帖子内容 (Markdown)",
  "category_id": 1,
  "tags": ["标签1", "标签2"],
  "cover_image": "可选封面图 URL",
  "status": "published"
}
```

---

### 回复模块 `/api/posts/:postId/replies` + `/api/replies`

回复采用两个 Controller:
- `/api/posts/:postId/replies`: 嵌套在帖子下
- `/api/replies`: 独立回复操作

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/api/posts/:postId/replies` | Public | 回复列表 (分页) |
| POST | `/api/posts/:postId/replies` | JwtAuthGuard | 创建回复 |
| GET | `/api/replies/:id` | Public | 单条回复详情 |
| PUT | `/api/replies/:id` | JwtAuthGuard | 更新回复 (作者) |
| DELETE | `/api/replies/:id` | JwtAuthGuard | 删除回复 (软删除) |

#### GET `/api/posts/:postId/replies`

**Query 参数**:
- `page` (可选, 默认 1): 页码
- `limit` (可选, 默认 20): 每页数量

---

### 用户模块 `/api/users`

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/me` | JwtAuthGuard | 当前用户信息 |
| PUT | `/me/profile` | JwtAuthGuard | 更新个人资料 |
| POST | `/me/avatar` | JwtAuthGuard | 上传头像 |
| DELETE | `/me/avatar` | JwtAuthGuard | 删除头像 |
| GET | `/me/replies` | JwtAuthGuard | 我的回复列表 |
| GET | `/search` | Public | 搜索用户 (@提及) |
| GET | `/:id` | Public | 用户公开资料 |
| GET | `/:id/replies` | Public | 用户回复列表 |

#### PUT `/api/users/me/profile`

**请求体** (UpdateProfileDto):
```json
{
  "username": "新用户名",
  "bio": "个人简介",
  "website": "个人网站 URL"
}
```

#### GET `/api/users/search`

**Query 参数**:
- `q` (必填): 搜索关键词
- `limit` (可选, 默认 10): 结果数量

---

### 分类模块 `/api/categories`

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/` | Public | 分类列表 |
| GET | `/:id` | Public | 分类详情 |

---

### 标签模块 `/api/tags`

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/` | Public | 标签列表 |
| GET | `/:slug/posts` | Public | 标签下的帖子 |

#### GET `/api/tags/:slug/posts`

**Query 参数**:
- `page` (可选, 默认 1): 页码
- `limit` (可选, 默认 20): 每页数量

---

### 通知模块 `/api/notifications`

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/` | JwtAuthGuard | 通知列表 (offset 分页) |
| GET | `/cursor` | JwtAuthGuard | 通知列表 (cursor 分页) |
| GET | `/unread-count` | JwtAuthGuard | 未读数量 |
| PUT | `/:id/read` | JwtAuthGuard | 标记单条已读 |
| PUT | `/read-all` | JwtAuthGuard | 全部标记已读 |

#### GET `/api/notifications/cursor`

**Query 参数**:
- `limit` (可选, 默认 20): 每页数量
- `cursor` (可选): 游标 (通知 ID)

**响应**:
```json
{
  "success": true,
  "data": {
    "data": [...],
    "nextCursor": "cursor_string"
  }
}
```

---

### 收藏模块 `/api/bookmarks`

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/` | JwtAuthGuard | 我的收藏列表 |
| GET | `/check/:postId` | JwtAuthGuard | 检查是否已收藏 |
| POST | `/:postId` | JwtAuthGuard | 收藏帖子 |
| DELETE | `/:postId` | JwtAuthGuard | 取消收藏 |

---

### 点赞模块 `/api/likes`

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| POST | `/posts/:postId` | JwtAuthGuard | 点赞帖子 |
| DELETE | `/posts/:postId` | JwtAuthGuard | 取消点赞帖子 |
| GET | `/posts/:postId` | Public | 查询帖子点赞状态/数量 |
| GET | `/posts` | JwtAuthGuard | 我点赞过的帖子 |
| POST | `/replies/:replyId` | JwtAuthGuard | 点赞回复 |
| DELETE | `/replies/:replyId` | JwtAuthGuard | 取消点赞回复 |
| GET | `/replies/:replyId` | Public | 查询回复点赞状态/数量 |
| GET | `/users/:userId/count` | Public | 用户获赞总数 |

#### GET `/api/likes/posts/:postId`

**Query 参数**:
- `userId` (可选): 用户 ID，用于判断是否已点赞

**响应**:
```json
{
  "success": true,
  "data": {
    "isLiked": true,
    "likeCount": 42
  }
}
```

---

### 私信模块 `/api/messages`

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| POST | `/` | JwtAuthGuard | 发送私信 |
| GET | `/` | JwtAuthGuard | 对话列表 (cursor 分页) |
| GET | `/unread-count` | JwtAuthGuard | 未读私信数量 |
| GET | `/:userId` | JwtAuthGuard | 与某用户的对话 |
| DELETE | `/:id` | JwtAuthGuard | 删除消息 (仅对自己) |

#### POST `/api/messages`

**请求体**:
```json
{
  "recipient_id": 2,
  "content": "私信内容"
}
```

#### GET `/api/messages/:userId`

**Query 参数**:
- `limit` (可选, 默认 50): 每页数量
- `cursor` (可选): 游标

---

### 附件模块 `/api/attachments`

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| POST | `/upload` | JwtAuthGuard | 上传附件 (批量, 最多 5 个) |
| GET | `/post/:postId` | Public | 帖子附件列表 |
| GET | `/:id/download` | Public | 下载附件 |
| DELETE | `/:id` | Roles(admin,mod) | 删除附件 |

#### POST `/api/attachments/upload`

**请求**:
- Content-Type: `multipart/form-data`
- Files field: `files` (最多 5 个)
- Body fields: `post_id`, `reply_id` (可选)

**文件限制**:
- 最大 10MB
- 允许类型: image/*, PDF, Office 文档, ZIP/RAR/7z, text/*

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "Files uploaded successfully",
    "attachments": [
      {
        "id": 1,
        "file_name": "image.png",
        "file_path": "/uploads/attachments/...",
        "file_size": 1024,
        "mime_type": "image/png"
      }
    ]
  }
}
```

---

### 资源模块 `/api/resources`

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/` | Public | 资源列表 (cursor 分页, 仅已审核) |
| GET | `/categories` | Public | 资源分类列表 |
| GET | `/admin` | Roles(admin,mod) | 资源管理列表 (所有状态) |
| GET | `/:id` | Public | 资源详情 (含版本) |
| GET | `/:id/download` | Public | 下载资源 |
| GET | `/:id/versions` | Public | 版本列表 |
| POST | `/` | JwtAuthGuard | 创建/上传资源 |
| PUT | `/:id` | JwtAuthGuard | 更新资源 (作者) |
| DELETE | `/:id` | JwtAuthGuard | 删除资源 (作者) |
| POST | `/:id/versions` | JwtAuthGuard | 添加版本 (作者) |
| PUT | `/:id/status` | Roles(admin,mod) | 更新审核状态 |
| DELETE | `/:id/admin` | Roles(admin,mod) | 管理员删除 |

#### GET `/api/resources`

**Query 参数** (QueryResourcesDto):
- `cursor` (可选): 游标
- `limit` (可选, 默认 20): 每页数量
- `category_id` (可选): 分类筛选
- `resource_type` (可选): 类型筛选

---

### 服务器模块 `/api/servers` — ⏸ EasyManager 暂停

保留 EasyManager 代理 API，用于未来恢复论坛服务器列表和申请。当前默认 `EASYMANAGER_ENABLED=false`：服务不会连接 EasyManager，公开查询返回空列表，申请接口返回禁用提示。

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/public` | Public | 公开服务器列表 |
| GET | `/versions` | Public | 可用游戏版本 |
| GET | `/templates` | Public | 服务器模板 |
| GET | `/:id/basic` | Public | 服务器基本信息 |
| GET | `/my` | JwtAuthGuard | 我的托管服务器 |
| POST | `/apply` | JwtAuthGuard | 申请托管服务器 |

#### POST `/api/servers/apply`

**请求体**:
```json
{
  "name": "服务器名称",
  "description": "服务器描述",
  "version": "Mindustry版本",
  "template_id": 1
}
```

---

### 帖子-服务器关联 `/api/post-servers` — 保留

该模块为 EasyManager 恢复时保留。当前服务器功能默认关闭时，前端入口隐藏，普通论坛功能不依赖这些接口。

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/by-server/:serverId` | Public | 服务器的关联帖子 |
| GET | `/my` | JwtAuthGuard | 我的帖子-服务器关联 |
| GET | `/forum-posts/:serverId` | ServiceAuthGuard | EasyManager 专用 |
| POST | `/link` | JwtAuthGuard | 关联帖子与服务器 |
| DELETE | `/:postId/server` | JwtAuthGuard | 取消关联 |

---

### 自动发帖回调 `/api/auto-post` — 保留

EasyManager 服务器审批后回调此模块，自动创建公告帖。当前 EasyManager 暂停时该入口不会被活跃服务调用，代码保留用于未来恢复。

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| POST | `/server-approved` | ServiceAuthGuard | 服务器审批通过回调 |

#### POST `/api/auto-post/server-approved`

**请求头**:
- `X-Service-Key`: EasyManager API 密钥

**请求体** (ServerApprovedCallbackDto):
```json
{
  "server_name": "服务器名称",
  "server_id": 1,
  "description": "服务器描述",
  "category_slug": "announcements",
  "event_id": "可选事件标识"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "post_id": 42,
    "created": true
  }
}
```

已存在时:
```json
{
  "success": true,
  "data": {
    "success": true,
    "post_id": 42,
    "duplicate": true,
    "message": "Server announcement already exists"
  }
}
```

---

### 管理后台 `/api/admin`

所有接口需 `JwtAuthGuard` + `RolesGuard`。

#### 仪表盘

| Method | Endpoint | 角色 | 说明 |
|--------|----------|------|------|
| GET | `/stats` | moderator+ | 统计数据 |
| GET | `/badge-counts` | moderator+ | 待处理数量徽章 |

#### 用户管理

| Method | Endpoint | 角色 | 说明 |
|--------|----------|------|------|
| GET | `/users` | admin | 用户列表 + 搜索 |
| PUT | `/users/:id/role` | admin | 修改用户角色 |

#### 帖子管理

| Method | Endpoint | 角色 | 说明 |
|--------|----------|------|------|
| GET | `/posts` | moderator+ | 帖子管理列表 |
| DELETE | `/posts` | moderator+ | 批量删除帖子 |
| PUT | `/posts/pin` | moderator+ | 批量置顶 |
| PUT | `/posts/move` | moderator+ | 批量移动分类 |
| PUT | `/posts/:id/pin` | moderator+ | 单个置顶 |
| PUT | `/posts/:id/move` | moderator+ | 单个移动分类 |

#### 分类管理

| Method | Endpoint | 角色 | 说明 |
|--------|----------|------|------|
| POST | `/categories` | admin | 创建分类 |
| PUT | `/categories/:id` | admin | 更新分类 |
| DELETE | `/categories/:id` | admin | 删除分类 |

#### 标签管理

| Method | Endpoint | 角色 | 说明 |
|--------|----------|------|------|
| GET | `/tags` | admin | 标签列表 |
| POST | `/tags` | admin | 创建标签 |
| PUT | `/tags/:id` | admin | 更新标签 |
| DELETE | `/tags/:id` | admin | 删除标签 |
| POST | `/tags/merge` | admin | 合并标签 |

#### 内容审核

| Method | Endpoint | 角色 | 说明 |
|--------|----------|------|------|
| GET | `/moderation` | moderator+ | 审核队列 |
| PUT | `/moderation/:id/approve` | moderator+ | 批准内容 |
| PUT | `/moderation/:id/reject` | moderator+ | 拒绝内容 |

#### 封禁管理

| Method | Endpoint | 角色 | 说明 |
|--------|----------|------|------|
| GET | `/bans` | admin | 封禁列表 |
| POST | `/bans` | admin | 创建封禁 |
| PUT | `/bans/:id` | admin | 更新封禁 |
| DELETE | `/bans/:id` | admin | 解除封禁 |

#### 系统配置

| Method | Endpoint | 角色 | 说明 |
|--------|----------|------|------|
| GET | `/settings` | admin | 所有配置 |
| GET | `/settings/:category` | admin | 分类配置 |
| PUT | `/settings/:category` | admin | 批量更新配置 |

#### 操作日志

| Method | Endpoint | 角色 | 说明 |
|--------|----------|------|------|
| GET | `/logs` | admin | 操作日志列表 |

#### 数据清理

| Method | Endpoint | 角色 | 说明 |
|--------|----------|------|------|
| POST | `/cleanup/sessions` | admin | 清理过期会话 |
| POST | `/cleanup/logs` | admin | 清理旧日志 |
| POST | `/cleanup/soft-deleted` | admin | 清理软删除数据 |

---

### 封禁模块 `/api/bans`

独立封禁管理端点 (与 admin 模块重复，提供更简洁路径)。

| Method | Endpoint | 认证 | 说明 |
|--------|----------|------|------|
| GET | `/` | Roles(admin) | 封禁列表 |
| POST | `/` | Roles(admin) | 创建封禁 |
| PUT | `/:id` | Roles(admin) | 更新封禁 |
| DELETE | `/:id` | Roles(admin) | 解除封禁 |

---

## 分页机制

### Offset 分页

适用于需要总页数的场景。

**请求参数**:
- `page`: 页码 (从 1 开始)
- `limit`: 每页数量

**响应格式**:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

**适用接口**:
- `/api/posts` (帖子列表)
- `/api/notifications` (通知列表)
- `/api/bookmarks` (收藏列表)
- `/api/admin/*` (管理后台)

### Cursor 分页

适用于无限滚动场景，性能更好。

**请求参数**:
- `cursor`: 上页最后一条记录的 ID
- `limit`: 每页数量

**响应格式**:
```json
{
  "data": [...],
  "nextCursor": 42
}
```

**适用接口**:
- `/api/posts/cursor` (帖子列表)
- `/api/notifications/cursor` (通知列表)
- `/api/resources` (资源列表)
- `/api/messages` (私信列表)

---

## 软删除机制

使用 TypeORM `@DeleteDateColumn()`:

- **帖子**: `DELETE /api/posts/:id` → 标记 `deleted_at`
- **回复**: `DELETE /api/replies/:id` → 标记 `deleted_at`
- **资源**: `DELETE /api/resources/:id` → 标记 `deleted_at`

软删除后:
- 公开查询自动过滤已删除数据
- 管理员可通过 admin 接口查看
- `/api/admin/cleanup/soft-deleted` 可永久清理

---

## 角色权限体系

### 角色定义

| 角色 | 权限级别 | 说明 |
|------|---------|------|
| `user` | 0 | 普通用户 |
| `moderator` | 1 | 版主 (内容管理) |
| `admin` | 2 | 管理员 (全部权限) |

### 权限范围

| 功能 | user | moderator | admin |
|------|------|-----------|-------|
| 查看内容 | ✓ | ✓ | ✓ |
| 发帖/回复 | ✓ | ✓ | ✓ |
| 编辑自己的内容 | ✓ | ✓ | ✓ |
| 删除自己的内容 | ✓ | ✓ | ✓ |
| 管理帖子 (置顶/移动) | ✗ | ✓ | ✓ |
| 审核内容 | ✗ | ✓ | ✓ |
| 删除任意内容 | ✗ | ✓ | ✓ |
| 用户管理 | ✗ | ✗ | ✓ |
| 分类/标签管理 | ✗ | ✗ | ✓ |
| 系统配置 | ✗ | ✗ | ✓ |
| 封禁管理 | ✗ | ✗ | ✓ |
| 查看日志 | ✗ | ✗ | ✓ |

---

## 验证管道配置

### ValidationPipe 配置

```typescript
new ValidationPipe({
  whitelist: true,           // 移除 DTO 未定义的属性
  forbidNonWhitelisted: true, // 有未定义属性时抛出异常
  transform: true,           // 自动转换类型
  transformOptions: {
    enableImplicitConversion: true,
  },
});
```

### DTO 示例

```typescript
// create-post.dto.ts
export class CreatePostDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  content: string;

  @IsInt()
  @IsOptional()
  category_id?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
```

---

## CORS 配置

```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,  // 允许携带 cookie
});
```

---

## Cookie 配置

OAuth 回调设置的 session cookie:

```typescript
res.cookie('forum_session', sessionToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 天
  path: '/',
});
```

---

## 服务集成

### MindAuth OAuth

| 配置项 | 环境变量 |
|--------|----------|
| OAuth URL | `MINDAUTH_URL` |
| Client ID | `MINDAUTH_CLIENT_ID` |
| Client Secret | `MINDAUTH_CLIENT_SECRET` |
| Callback URL | `MINDAUTH_CALLBACK_URL` |

### EasyManager — ⏸ 暂停中

| 配置项 | 环境变量 | 默认 |
|--------|----------|------|
| Enable Flag | `EASYMANAGER_ENABLED` | `false` |
| API URL | `EASYMANAGER_URL` | `http://localhost:5001` |
| Service Key | `EASYMANAGER_API_KEY` | 空 |

**禁用时行为**:
- `GET /api/servers/public` → 返回空服务器列表
- `GET /api/servers/versions` → 返回空版本列表
- `GET /api/servers/templates` → 返回空模板列表
- `POST /api/servers/apply` → 返回服务器功能已关闭

**恢复后论坛调用 EasyManager**:
- `GET /api/servers/public` → EasyManager `/api/forum/servers/public`
- `GET /api/servers/my` → EasyManager `/api/forum/user/:mindauthId/servers`
- `POST /api/servers/apply` → EasyManager `/api/forum/apply`

**EasyManager 回调论坛**（恢复后）:
- `POST /api/auto-post/server-approved` (X-Service-Key 认证)

---

*文档基于 NestJS 实际代码生成，未经实现的接口未记录*