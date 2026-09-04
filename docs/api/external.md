# MindFourm External API（第三方机器人 API）

> 更新时间：2026-07-28  
> 状态：M1 已实现。用于机器人/第三方服务以 API Key 调用论坛能力，可在授权 scope 内指定论坛用户发帖、回复、审核和管理资源。

## 设计目标

External API 面向服务端机器人，不面向浏览器用户。典型用途：

- QQ / Discord / Telegram 机器人代用户发帖、回复
- 自动审核队列、批量通过/拒绝内容
- 自动同步资源中心条目
- 查询帖子、回复、分类、标签、用户和资源信息

与普通前台 API 的主要区别：

- 使用 API Key，而不是 `forum_session` cookie
- 写接口免 CSRF，适合服务端调用
- 可以在具备 `users:impersonate` scope 时指定目标用户
- 每个 key 都有独立 scopes、启停、过期、IP 白名单、限流和审计日志

---

## Base URL

后端全局前缀是 `/api`，External API 前缀为：

```txt
/api/external/v1
```

例如：

```txt
POST /api/external/v1/posts
```

---

## 认证

支持两种 header，推荐 `Authorization: Bearer`：

```http
Authorization: Bearer mfk_live_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyy
```

或：

```http
X-API-Key: mfk_live_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyy
```

API Key 明文只会在后台创建/轮换时显示一次；数据库只保存 SHA-256 hash 和 `key_prefix`。

### Legacy fallback

旧的 `FORUM_API_KEY` 仍可作为过渡 fallback 使用。它会被视为：

```txt
admin:* + users:impersonate
```

生产环境建议尽快迁移到后台创建的 External API Key，因为新 key 可单独限权、停用、轮换和审计。

---

## 用户代发 / 指定用户

写接口支持在 body 或 query 中提供下列三者之一：

```json
{
  "user_id": 123
}
```

```json
{
  "mindauth_id": 456
}
```

```json
{
  "username": "alice"
}
```

规则：

- 三个字段只能提供一个。
- 如果没有提供用户，则使用 API Key 的 `default_user_id`。
- 如果也没有默认用户，请求会失败。
- 只有具备 `users:impersonate` 的 key 才能显式指定用户。
- 写操作默认仍要求目标用户已验证手机号。
- 如果确实需要绕过手机号验证，需要额外授予 `users:bypass_phone_verification`，不建议默认开放。
- 被封禁用户不能被代发。

---

## Scopes

| Scope | 用途 |
|---|---|
| `posts:read` | 查询帖子列表和详情 |
| `posts:write` | 创建/编辑帖子 |
| `posts:delete` | 删除帖子 |
| `posts:moderate` | 审核、置顶、锁帖、移动、最佳答案等帖子管理动作 |
| `replies:read` | 查询回复 |
| `replies:write` | 创建/编辑回复 |
| `replies:delete` | 删除回复 |
| `resources:read` | 查询资源中心 |
| `resources:write` | 创建/编辑资源 |
| `resources:delete` | 删除资源 |
| `resources:moderate` | 审核资源；具备该 scope 的资源列表可看到管理范围数据 |
| `users:read` | 查询用户安全字段 |
| `users:impersonate` | 指定任意用户作为 actor |
| `users:bypass_phone_verification` | 允许代发未验证手机号用户（高风险） |
| `categories:read` | 查询论坛分类 |
| `tags:read` | 查询标签 |
| `audit:read` | 查看 External API 审计日志（后台接口） |
| `admin:*` | 管理员级通配 scope，高风险 |
| `*` | 全部权限，高风险 |

---

## 通用响应格式

项目全局 `ResponseInterceptor` 会包装成功响应：

```json
{
  "success": true,
  "data": {}
}
```

错误响应：

```json
{
  "success": false,
  "code": "EXTERNAL_API_SCOPE_DENIED",
  "message": "External API key scope denied"
}
```

常见错误码：

| Code | HTTP | 含义 |
|---|---:|---|
| `EXTERNAL_API_KEY_INVALID` | 401 | 缺少或错误 API Key |
| `EXTERNAL_API_KEY_DISABLED` | 403 | Key 已停用 |
| `EXTERNAL_API_KEY_EXPIRED` | 403 | Key 已过期 |
| `EXTERNAL_API_SCOPE_DENIED` | 403 | 缺少 scope |
| `EXTERNAL_API_IP_DENIED` | 403 | 请求 IP 不在白名单 |
| `EXTERNAL_API_RATE_LIMITED` | 429 | Key 限流超限 |
| `EXTERNAL_API_IMPERSONATION_DENIED` | 403 | 没有指定用户代发权限 |
| `EXTERNAL_API_ACTOR_REQUIRED` | 400 | 没有指定用户，也没有默认用户 |
| `EXTERNAL_API_ACTOR_NOT_FOUND` | 404 | 指定用户不存在 |
| `PHONE_NOT_VERIFIED` | 403 | 指定用户未验证手机号 |

每个 External API 响应会带：

```http
X-Request-ID: <request-id>
```

如果调用方传入 `X-Request-ID`，后端会沿用；否则自动生成。

---

## 正文格式（Markdown 富文本）

所有包含 `content` 字段的写接口（发帖、回复、资源说明等）均支持 **Markdown + GFM（GitHub Flavored Markdown）** 富文本格式。请求体中的 `content` 使用 Markdown 语法编写，后端通过 `marked` + `sanitize-html` 解析为安全的 HTML 后存储，前端以 `react-markdown` + `remark-gfm` 渲染。

### 支持的语法

| 类型 | 语法示例 |
| --- | --- |
| **标题** | `# H1` ～ `###### H6` |
| **加粗** | `**粗体**` |
| **斜体** | `*斜体*` |
| **下划线** | `<u>下划线</u>` |
| **删除线** | `~~删除线~~`，或 `<del>删除</del>` / `<s>删除</s>` |
| **行内代码** | `` `code` `` |
| **代码块**（支持语法高亮） | 三个反引号包裹，如 <code>```ts</code> |
| **引用** | `> 引用内容` |
| **无序列表** | `- 项目` |
| **有序列表** | `1. 项目`（支持 `start` 起始序号） |
| **任务列表**（GFM 复选框） | `- [x] 已完成` / `- [ ] 未完成` |
| **链接** | `[文字](https://example.com)` |
| **图片** | `![alt](https://example.com/img.png)` |
| **表格**（GFM） | `\| 列1 \| 列2 \|` |
| **分割线** | `---` |
| **上下标** | `<sub>下标</sub>`、`<sup>上标</sup>` |
| **插入文本** | `<ins>插入</ins>` |
| **折叠块** | `<details><summary>标题</summary>内容</details>` |

### 渲染与安全限制

- 允许的 URL 协议：仅 `http`、`https`、`mailto`；拒绝 `javascript:`、`data:` 等协议及编码变体。
- 所有链接自动添加 `target="_blank"` 与 `rel="nofollow noopener noreferrer"`，在新窗口打开且不传递来源信息。
- 图片自动懒加载（`loading="lazy"`）并异步解码（`decoding="async"`）。
- 行内或原始 `<script>`、`<style>` 及 `on*` 事件属性会被移除。
- 表格单元格支持 `colspan`、`rowspan`、`scope` 属性。
- GFM 任务列表渲染为只读（`disabled`）复选框。

> **提示**：`content` 为空字符串或纯文本时同样有效——纯文本会被作为普通段落处理。

## API Key 管理接口（后台）

后台页面：

```txt
/admin/settings/external-api
```

后台 API：

```txt
/api/admin/external-api
```

这些接口需要普通后台登录、`JwtAuthGuard + RolesGuard`，且角色为 `admin`。

### 创建 Key

```http
POST /api/admin/external-api/keys
Content-Type: application/json
```

```json
{
  "name": "QQ 审核机器人",
  "scopes": ["posts:read", "posts:write", "replies:write", "users:impersonate"],
  "allowed_ips": ["203.0.113.10", "203.0.113.0/24"],
  "default_user_id": 1,
  "rate_limit_per_minute": 120,
  "expires_at": "2026-12-31T23:59:59+08:00"
}
```

响应中的 `plain_key` 只显示一次：

```json
{
  "success": true,
  "data": {
    "key": {
      "id": 1,
      "name": "QQ 审核机器人",
      "key_prefix": "mfk_live_abcd1234",
      "scopes": ["posts:read", "posts:write", "replies:write", "users:impersonate"],
      "enabled": true
    },
    "plain_key": "mfk_live_abcd1234.xxxxxxxxxxxxxxxxx"
  }
}
```

### 其他管理接口

| Method | Endpoint | 说明 |
|---|---|---|
| GET | `/api/admin/external-api/keys` | Key 列表 |
| PATCH | `/api/admin/external-api/keys/:id` | 更新名称、scopes、白名单、默认用户、限流、过期、启用状态 |
| POST | `/api/admin/external-api/keys/:id/rotate` | 轮换密钥，旧密钥立即失效 |
| POST | `/api/admin/external-api/keys/:id/enable` | 启用 |
| POST | `/api/admin/external-api/keys/:id/disable` | 停用 |
| GET | `/api/admin/external-api/audit-logs` | 审计日志 |

---

## 查询信息

### 当前 Key 信息

```http
GET /api/external/v1/me
Authorization: Bearer <key>
```

返回当前 key 的安全视图、scopes 和 request id。

### 查询用户

需要：`users:read`

```http
GET /api/external/v1/users/123
Authorization: Bearer <key>
```

只返回安全字段：`id`、`mindauth_id`、`username`、`role`、`avatar_url`、`bio`、`total_points`、`created_at`。

### 查询分类和标签

```http
GET /api/external/v1/categories
GET /api/external/v1/tags?page=1&limit=50
```

需要：

- 分类：`categories:read`
- 标签：`tags:read`

---

## 帖子 API

### 查询帖子列表

需要：`posts:read`

```http
GET /api/external/v1/posts?page=1&limit=20&status=pending
Authorization: Bearer <key>
```

External API 使用管理员视角查询帖子，因此可用于审核机器人读取 `pending` 内容。

### 创建帖子

需要：`posts:write`，显式指定用户还需要 `users:impersonate`。

```http
POST /api/external/v1/posts
Authorization: Bearer <key>
Content-Type: application/json
```

```json
{
  "username": "alice",
  "title": "机器人同步的公告",
  "content": "这是 **Markdown** 正文。",
  "category_id": 1,
  "tags": ["公告", "机器人"],
  "status": "published"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "id": 123,
    "type": "post",
    "status": "pending",
    "actor_user_id": 45,
    "post": {}
  }
}
```

注意：即使请求 `status=published`，仍会经过站点的 `require_post_approval` 设置；如果开启审核，会落为 `pending`。

### 更新帖子

需要：`posts:write`

```http
PATCH /api/external/v1/posts/123
Authorization: Bearer <key>
Content-Type: application/json
```

```json
{
  "user_id": 45,
  "title": "更新后的标题",
  "content": "更新后的正文",
  "tags": ["更新"]
}
```

### 删除帖子

需要：`posts:delete`

```http
DELETE /api/external/v1/posts/123?user_id=45
Authorization: Bearer <key>
```

删除是软删除。

### 帖子审核/管理

需要：`posts:moderate`

```http
POST /api/external/v1/posts/123/moderation
Authorization: Bearer <key>
Content-Type: application/json
```

支持动作：

| action | 额外字段 | 说明 |
|---|---|---|
| `approve` | - | 通过帖子，设为 `published` |
| `reject` | `reason` | 拒绝帖子，设为 `deleted` 并记录原因 |
| `pin` / `unpin` | - | 置顶/取消置顶 |
| `lock` / `unlock` | - | 锁帖/解锁 |
| `move` | `category_id` | 移动分类 |
| `best_reply` | `reply_id` | 设置最佳答案 |
| `clear_best_reply` | - | 清除最佳答案 |

示例：

```json
{
  "user_id": 1,
  "action": "approve"
}
```

---

## 回复 API

### 查询帖子回复

需要：`replies:read`

```http
GET /api/external/v1/posts/123/replies?page=1&limit=20
Authorization: Bearer <key>
```

### 创建回复

需要：`replies:write`

```http
POST /api/external/v1/posts/123/replies
Authorization: Bearer <key>
Content-Type: application/json
```

```json
{
  "mindauth_id": 456,
  "content": "机器人代用户回复",
  "parent_reply_id": 10
}
```

### 查询、更新、删除回复

```http
GET /api/external/v1/replies/456
PATCH /api/external/v1/replies/456
DELETE /api/external/v1/replies/456?user_id=45
```

更新需要 `replies:write`，删除需要 `replies:delete`。

### 回复审核

```http
POST /api/external/v1/replies/456/moderation
Authorization: Bearer <key>
Content-Type: application/json
```

```json
{
  "user_id": 1,
  "action": "approve"
}
```

支持：`approve`、`reject`。

---

## 资源中心 API

### 查询资源

需要：`resources:read`

```http
GET /api/external/v1/resources?limit=20&status=pending
Authorization: Bearer <key>
```

如果 key 具备 `resources:moderate`，列表使用管理视角；否则只返回公开可见资源。

### 查询资源分类

```http
GET /api/external/v1/resources/categories
Authorization: Bearer <key>
```

### 创建资源

需要：`resources:write`

当前 External API 支持 JSON 创建外链资源：

```http
POST /api/external/v1/resources
Authorization: Bearer <key>
Content-Type: application/json
```

```json
{
  "username": "alice",
  "title": "地图包下载",
  "description": "一个地图资源",
  "resource_type": "external",
  "external_url": "https://example.com/map.zip",
  "version": "1.0.0",
  "content": "资源说明，支持 Markdown",
  "category_id": 2,
  "is_public": true
}
```

文件上传仍建议先走现有前台/后台资源上传链路；后续可为 External API 增加 multipart 上传。

### 更新、删除、审核资源

```http
PATCH /api/external/v1/resources/123
DELETE /api/external/v1/resources/123?user_id=45
POST /api/external/v1/resources/123/moderation
```

审核动作：

```json
{
  "user_id": 1,
  "action": "approve"
}
```

`action` 支持：`approve`、`reject`、`pending`。

---

## 审计日志

每个写操作都会记录两层日志：

1. `external_api_audit_logs`
   - 记录 API key、scope、actor、target、request id、IP、UA、状态和错误。
2. `operation_logs`
   - 记录为 `external.<action>`，用于现有后台操作日志体系。

后台最近审计日志可在：

```txt
/admin/settings/external-api
```

或调用：

```http
GET /api/admin/external-api/audit-logs?page=1&limit=20
```

---

## curl 示例

### 创建帖子

```bash
curl -X POST "https://forum.example.com/api/external/v1/posts" \
  -H "Authorization: Bearer mfk_live_xxxxxxxx.yyyyyyyyy" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: bot-post-001" \
  -d '{
    "username": "alice",
    "title": "机器人发帖测试",
    "content": "这是一条来自机器人的帖子。",
    "category_id": 1,
    "tags": ["bot", "test"],
    "status": "published"
  }'
```

### 回复帖子

```bash
curl -X POST "https://forum.example.com/api/external/v1/posts/123/replies" \
  -H "Authorization: Bearer mfk_live_xxxxxxxx.yyyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 45,
    "content": "收到，机器人已处理。"
  }'
```

### 审核通过帖子

```bash
curl -X POST "https://forum.example.com/api/external/v1/posts/123/moderation" \
  -H "Authorization: Bearer mfk_live_xxxxxxxx.yyyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "action": "approve"
  }'
```

---

## 部署注意事项

- 本功能新增数据库迁移：`1720000011000-CreateExternalApiTables.ts`。
- 当前项目配置 `migrationsRun: true`，正常启动后会自动执行迁移。
- 如果生产环境禁用自动迁移，需要手动执行迁移后再启动服务。
- 生产 API Key 建议：
  - 不发放 `admin:*` / `*`，除非是完全可信的内部机器人。
  - 尽量配置 IP 白名单。
  - 使用最小 scopes。
  - 定期轮换密钥。
  - 查看审计日志确认机器人行为。
