# Android M0：API 缺口清单

**状态：** Accepted；**范围：** Android 一期（Reader + Community Client）。

## 结论

当前 `/api/v1` 是受支持的第一方接口，但稳定模块只覆盖 capabilities、threads、resources、discover 与 portal。Android 一期所需的写入、账户、通知和图片接口多数仍是 Web 内部 `/api/*`，不得由 Android 直接作为长期依赖使用。

一期后端目标是把下表“新增 V1”项目落实为同一份版本化契约；旧 `/api/*` 不删除、不改语义，Web 继续兼容。

## 已有能力与缺口

| Android 场景 | 当前实现 | 结论 / M0 决策 |
| --- | --- | --- |
| 能力发现 | `GET /api/v1/capabilities` | 复用；扩展 `device_auth`、`notifications_v1` 和 Android 版本字段。 |
| 主题列表、详情 | `GET /api/v1/threads`、`GET /api/v1/threads/:id` | 已有但仅摘要、Offset 分页，缺正文、作者、标签、互动状态、Cursor 与统一列表形态；扩展为完整 threads V1。 |
| 分类、标签 | `/api/categories`、`/api/tags` | 迁移为只读 V1。 |
| 搜索 | `/api/search` | 迁移为 V1；一期只返回帖子搜索结果，不混入资源。 |
| 创建、编辑、删除主题 | `/api/posts` | 扩展为 threads V1 写接口；保留现有审核、锁帖、手机号验证、限流和操作日志语义。 |
| 回复 | `/api/posts/:postId/replies`、`/api/replies/:id` | 扩展为 threads/replies V1；返回根回复及其子回复，不能拆散线程。 |
| 点赞 | `/api/likes/posts/:postId` | 扩展为 threads V1，详情和流列表可带当前用户 `viewer.liked`。 |
| 收藏 | `/api/bookmarks/:postId` | 新增 V1，名称统一为 `bookmarks`，不用 `favorites`。 |
| 举报 | `POST /api/reports` | 新增 V1；严格复用现有举报对象、原因和频控。 |
| 个人资料、我的内容 | `/api/users/me`、`/api/posts/user/:userId`、`/api/bookmarks` | 新增 `me` 聚合和 Cursor 列表，避免 App 拼接内部接口。 |
| 通知与 SSE | `/api/notifications/*`、`/api/notifications/events` | 新增 V1 HTTP + SSE；事件不得携带整篇帖子正文。 |
| 图片 | 仅有管理员公共图片上传及附件上传 | 新增面向帖文 Markdown 的 V1 图片接口；不复用管理员接口。 |
| App 登录 | Web OAuth callback + `forum_session` | 新增独立 Mobile Auth（见 RFC）。 |

## 一期 V1 契约

所有响应遵循既有 V1 信封：成功为 `{ "data": ..., "meta": { "request_id": "..." } }`；错误为 `{ "error": { "code", "message", "retryable", "details" }, "meta": ... }`。客户端以 HTTP 状态和 `error.code` 判断流程，不解析中文 `message`。

### 命名规则

数据库和旧 Web 路由继续使用 `Post`/`posts`；V1 对外只把它称为 `Thread`/`threads`。一期不得新增 `/api/v1/posts/*`，以免与已有 `/api/v1/threads/*` 形成两个主题概念。其余领域命名为 `Reply`、`Bookmark`、`Like`、`Category`、`Tag`、`Notification`；`forum_session` 仅服务 Web，`MobileSession` 仅服务 Android。

### 匿名阅读

```text
GET /api/v1/threads?limit=20&cursor={opaque}&category_id={id}&sort=latest
GET /api/v1/threads/{id}
GET /api/v1/threads/{id}/replies?limit=20&cursor={opaque}
GET /api/v1/categories
GET /api/v1/tags
GET /api/v1/search/posts?q={query}&page=1&limit=20
GET /api/v1/client/config?platform=android&version_code=100
```

帖子流统一返回：

```json
{
  "data": {
    "items": [],
    "next_cursor": "opaque-or-null",
    "has_more": true
  },
  "meta": { "request_id": "..." }
}
```

`cursor` 是不透明值；服务端应以 `Date` 处理时间游标，不能把 ISO 字符串直接交给 MySQL DATETIME 比较。搜索允许 page 分页，但其 `pagination` 必须同时含 `page`、`limit`、`total`、`total_pages`。

### 需要登录的社区操作

```text
POST   /api/v1/threads
PATCH  /api/v1/threads/{id}
DELETE /api/v1/threads/{id}
POST   /api/v1/threads/{id}/replies
PATCH  /api/v1/replies/{id}
DELETE /api/v1/replies/{id}
PUT    /api/v1/threads/{id}/like
DELETE /api/v1/threads/{id}/like
PUT    /api/v1/threads/{id}/bookmark
DELETE /api/v1/threads/{id}/bookmark
POST   /api/v1/reports
POST   /api/v1/uploads/images
GET    /api/v1/me
GET    /api/v1/me/posts?limit=20&cursor={opaque}
GET    /api/v1/me/bookmarks?limit=20&cursor={opaque}
```

写入保持既有权限模型：登录、封禁、手机号验证、作者/版主授权及限流都在服务端执行。客户端只根据结构化错误呈现引导；不能以 UI 隐藏替代授权。

图片上传使用 `multipart/form-data` 字段 `image`，只接受 JPEG、PNG、GIF、WebP，最大 2 MiB。返回可插入 Markdown 的绝对 HTTPS URL，以及 MIME、尺寸和文件标识；服务端校验 MIME 与扩展名并清理失败上传。

### 通知和客户端配置

```text
GET  /api/v1/notifications?limit=20&cursor={opaque}
GET  /api/v1/notifications/unread-count
PUT  /api/v1/notifications/{id}/read
PUT  /api/v1/notifications/read-all
GET  /api/v1/notifications/events       (SSE)
GET  /api/v1/client/config?platform=android&version_code=100
```

SSE 最小事件：

```json
{ "type": "notification.created", "notification_id": 456, "resource_type": "post", "resource_id": 123 }
```

事件仅驱动未读数或 Repository 刷新。认证失效时连接关闭，App 尝试一次刷新令牌；仍失败则回到登录态，避免无限重连。

`client/config` 至少含 `minimum_version_code`、`latest_version_code`、`force_update`、`maintenance` 与一期特性开关（`posting`、`image_upload`、`notifications_sse`）。任何未声明或值为 `false` 的能力均在客户端隐藏。

## 实施顺序与验收

1. 先实现 Mobile Auth 与 V1 Bearer Guard，再实现任何 V1 写接口或 SSE。
2. 先交付主题读模型、分类、搜索和客户端配置，M1 即可产生可浏览 APK。
3. 再交付发帖/回复/互动/上传，最后交付通知。

验收以 OpenAPI JSON、契约测试和 Android MockWebServer 样例为准；每个新增 V1 端点必须有成功、未登录、无权限、验证失败和限流/冲突（如适用）用例。
