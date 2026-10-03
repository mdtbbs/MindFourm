# 外部服务 API（机器人与服务端集成）

> Repository-side reference for separately approved server integrations. This guide is not linked or served from the third-party Public Client Developer Center.

**更新时间：**2026-07-28 · **状态：**M1 已实现。本文介绍机器人和第三方服务如何通过 API Key 调用论坛，并在已授权的 scope 范围内代指定用户发帖、回复、审核和管理资源。

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

## 接口地址

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

### 旧版 API Key 兼容

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

## 权限范围（Scopes）

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
| `friends:read` | 查询好友列表、好友请求、用户搜索和好友关系 |
| `categories:read` | 查询论坛分类 |
| `tags:read` | 查询标签 |
| `audit:read` | 查看 External API 审计日志（后台接口） |
| `admin:*` | 管理员级通配 scope，高风险 |
| `*` | 全部权限，高风险 |

---

## 好友关系查询（LanLink）

LanLink 使用此端点验证两个论坛用户是否存在已接受的好友关系。请求需要 `friends:read` scope：

```http
GET /api/external/v1/friends/check?user_id=123&friend_id=456
Authorization: Bearer <external-api-key>
```

两个参数都必须是大于零的安全整数。成功响应由全局响应拦截器包装：

```json
{
  "success": true,
  "data": {
    "ok": true,
    "is_friend": true
  }
}
```

若没有已接受的好友关系，`is_friend` 为 `false`。参数无效返回 HTTP 400；缺少 `friends:read` 返回 HTTP 403。好友关系查询发生错误时接口会返回错误，不会返回肯定结果；调用方必须将非成功响应视为未获授权。

## 凭证边界

External API Key 仅用于获准的服务端集成。Public Client、浏览器、Android、桌面客户端、Mod 和启动器不得使用或转发这类凭证。服务间身份转换和 Forum 内部控制接口不属于此服务端集成指南。

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

## 正文格式（Rich Content Schema v2）

新客户端写帖子、回复或资源长描述时，应发送 `content_schema_version: 2` 和 `content_json`。JSON 是正文的规范来源；`content` Markdown 仅用于旧客户端兼容、搜索、摘要、通知、RSS 和纯文本降级。Markdown-only 请求仍通过兼容路径转换为 v2 JSON。

```json
{
  "content_schema_version": 2,
  "content_json": {
    "type": "doc",
    "content": [
      { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "标题" }] },
      { "type": "paragraph", "content": [{ "type": "text", "text": "重点", "marks": [{ "type": "bold" }] }] },
      { "type": "bulletList", "attrs": { "tight": true }, "content": [{ "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "条目" }] }] }] }
    ]
  }
}
```

支持的块节点：`paragraph`、`heading`、`blockquote`、`bulletList`、`orderedList`、`listItem`、`taskList`、`taskItem`、`codeBlock`、`horizontalRule`、`table`、`spoiler`、`video`、`attachment`、`postQuote`、`replyQuote`。行内节点：`text`、`hardBreak`、`image`、`mention`、`customEmoji`。Marks：bold、italic、strike、underline、code、link、textColor、highlight、fontSize、fontFamily、superscript、subscript。

属性按节点严格校验。错误详情包含 JSON path、node、attribute 和 schema version；未知节点/mark 不会静默丢弃。资源描述拒绝 video、attachment、postQuote 和 replyQuote。视频 provider 随站点配置启用；附件引用必须属于当前帖子/回复并遵循现有审核流程；引用节点只存 ID，读取时重新检查权限。

下方 Markdown 语法表描述的是兼容投影，无法表达 v2 的颜色、字号/字体、结构化引用、Mention、附件、视频和自定义表情。

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

## 凭证管理

API Key 由论坛运营方通过受控管理流程签发、限制权限并轮换。管理界面和管理 API 不属于 External API 契约；集成方应通过获准渠道申请凭证，并按最小权限原则使用。

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
  "content_schema_version": 2,
  "content_json": {
    "type": "doc",
    "content": [
      { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "本周公告" }] },
      { "type": "paragraph", "content": [{ "type": "text", "text": "这是 " }, { "type": "text", "text": "Rich Content", "marks": [{ "type": "bold" }] }] }
    ]
  },
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
  "content_schema_version": 2,
  "content_json": {
    "type": "doc",
    "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "更新后的正文" }] }]
  },
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
  "content_schema_version": 2,
  "content_json": {
    "type": "doc",
    "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "机器人代用户回复" }] }]
  },
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
  "content_schema_version": 2,
  "content_json": {
    "type": "doc",
    "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "资源长描述" }] }]
  },
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

## 审计

服务端集成写操作会记录审计信息。凭证持有者应保存 API 返回的 request ID，并在需要调查时提供给论坛运营方；审计查询功能不属于 External API 契约。

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

## 安全建议

- 只在可信服务端保存 API Key，不要提交到源码仓库。
- 只申请业务必需的 scopes，并在可能时限制来源网络。
- 发现凭证泄漏时立即联系论坛运营方停用并轮换。
- 保留请求 ID，按接口返回的状态和错误码处理失败。
