# 第三方客户端接入指南

本指南面向 Web、Android、桌面客户端、Mindustry Mod 和第三方启动器。所有应用使用同一套 MindAuth OAuth 授权码模式 + PKCE S256，并调用 `/api/v1/*`；应用名称或客户端类型不会自动增加权限。

在线的[第三方客户端授权指南](https://mdtbbs.cn/api/v1/docs/oauth)介绍应用申请、重定向地址、PKCE、权限申请、令牌交换、刷新和撤销。MindAuth 协议细节及 Java/Kotlin PKCE 示例见 [公开客户端 PKCE 指南](https://github.com/mdtbbs/MindAuth/blob/main/docs/public-client-pkce.md)。MindFourm 的 OpenAPI 契约位于 `/api/openapi/v1.json`。

## 接入顺序

1. 登录并完成手机号验证，在 MindAuth 开发者中心自助创建公开客户端。创建后立即取得 `client_id`，无需管理员审核；公开客户端没有 `client_secret`，创建接口按 IP 限流。
2. 注册精确重定向地址和所需权限范围。桌面本机回环支持 `127.0.0.1`、`[::1]` 和 `localhost`；以端口 `0` 注册可匹配运行时随机端口，其他内网地址不允许。
3. 客户端生成随机 PKCE 校验值，计算 S256 挑战值，使用系统浏览器打开 MindAuth `/api/authorize`，并验证返回的 `state`。
4. 使用授权码、相同的 `redirect_uri`、校验值和 `client_id` 调用 MindAuth `/api/token`。
5. 将访问令牌作为 `Authorization: Bearer` 调用 MindFourm。论坛服务端通过保密的资源服务器凭据校验不透明令牌；客户端不解析令牌，也不接触论坛的 `MINDAUTH_CLIENT_SECRET`。
6. 访问令牌过期后通过标准 `/api/token` 的 `grant_type=refresh_token` 轮换刷新令牌。建议每次刷新使用唯一且预先持久化的 `Idempotency-Key`；超时或 5xx 时用原刷新令牌与同一 key 重试，成功后原子保存新刷新令牌并清除待处理 key。不带 key 的旧客户端仍按原有单次轮换行为工作，但不能恢复超时前的结果；格式错误的非空 key 会返回 `400 invalid_request`，且不会消费令牌。退出或解除授权调用 MindAuth `/api/revoke` 或用户的“已授权应用”页面。

不要把 MindAuth 密码、外部 API 密钥、服务端密钥或客户端密钥放进客户端。注册和账号验证始终在 MindAuth 网页端完成。

## OAuth 权限范围

权限范围是按操作类型划分的权限类别，不会为每条 API 路径单独设置。一个权限范围可以覆盖多条接口；申请时只选择产品实际需要的权限。开发者修改应用所需的权限范围后会立即生效。MindAuth 授权页面会显示中文说明；首次授权显示全部权限，之后只突出新增项。`message.read` 和 `message.write` 属于敏感权限，但目前不需要人工审核。

| 权限范围 | 用途 | MindFourm API |
| --- | --- | --- |
| `openid` | OIDC 身份标识 | MindAuth 登录流程 |
| `profile` | 用户基本资料 | `GET /api/v1/me`、修改本人资料和头像；首次在论坛建立本地身份时需要 |
| `email` | 邮箱声明 | MindAuth 用户信息接口（UserInfo）的邮箱兼容权限范围，可选；首次建立论坛身份不需要 |
| `forum.read` | 读取论坛 | 讨论、回复、搜索、公开用户资料、举报查询、收藏查询 |
| `forum.write` | 论坛写入 | 创建/编辑/删除讨论与回复、举报提交、反馈、图片上传 |
| `resource.read` | 读取资源 | 资源列表、详情、清单、预览 |
| `resource.download` | 下载资源文件 | 资源 V1 文件下载 |
| `resource.upload` | 提交资源 | 资源草稿、地图/蓝图预览和提交 |
| `notification.read` | 读取和处理通知 | 通知 V1 |
| `message.read` | 读取私信 | 私信 V1 读取接口 |
| `message.write` | 发送私信 | `POST /api/v1/messages` |
| `friends.read` | 读取好友与可见社交状态 | 好友列表、好友请求、按隐私策略可见的社交数据 |
| `presence.read` | 读取在线状态 | 在线状态查询；仍受用户隐私设置约束 |
| `presence.write` | 更新在线状态 | 在线状态 / 富活动状态写入；客户端能力另需审核 |
| `multiplayer.read` | 查看联机会话 | 可访问的会话、对端与连接信息 |
| `multiplayer.write` | 使用联机功能 | 创建或加入会话、邀请好友、申请中继；多人联机客户端能力另需审核 |
| `game_content.saves.read` | 读取游戏云存档 | 云存档 V1 读取接口 |
| `game_content.saves.write` | 写入游戏云存档 | 创建或更新存档、上传快照 |
| `game_content.saves.delete` | 删除游戏云存档 | 删除存档槽或快照 |

权限范围表示客户端被允许请求某一类操作，不替代论坛的用户权限、手机号验证、社区条款、站点开关、封禁、内容审核、资源策略或私信开关。失败时读取 HTTP 状态和稳定的 `error.code`；不要匹配可能变化的提示文字。

论坛 API 参考里的业务分组不一定对应 OAuth 权限范围：蓝图/地图等游戏内容读取使用 `resource.read`，上传使用 `resource.upload`；公开 GET 可以匿名访问，携带 OAuth Bearer 时才按该接口声明的权限范围校验。服务端机器人集成如使用独立 API Key，应只在可信服务端保存，不能作为公开客户端凭证。

论坛会验证 MindAuth Bearer 令牌，并按令牌实际授予的权限范围校验 V1 操作。令牌失效或撤销后，客户端应停止使用该令牌。缺少权限范围时读取稳定的 `error.code`；例如 `INSUFFICIENT_SCOPE` 会说明操作所需的权限范围。

## 服务能力发现

`GET /api/v1/capabilities` 不需要认证。能力受论坛站点设置控制，运行时可能变化；`true` 也不代表当前用户已有对应 OAuth 权限范围或本地写入权限。

```json
{
  "forum": { "read": true, "write": true, "search": true, "image_upload": true },
  "resources": { "read": true, "download": true, "upload": true },
  "notifications": { "read": true, "sse": false },
  "messages": { "available": true, "third_party_access": false },
  "game_content": {
    "maps": { "read": true, "download": true, "upload": true },
    "schematics": { "read": true, "download": true, "upload": true }
  },
  "multiplayer": {
    "social_presence_v1": true,
    "rich_activity_v1": true,
    "multiplayer_sessions_v1": true,
    "multiplayer_invites_v1": true,
    "multiplayer_relay_v1": false,
    "third_party_multiplayer_v1": false
  },
  "cloud_saves_v1": true,
  "client": { "minimum_supported_version": null, "recommended_version": null },
  "resource_read": true,
  "resource_files": true,
  "download_grants": true,
  "device_auth": false,
  "notifications_v1": true,
  "notices_v1": true,
  "forge_preview": true,
  "blueprint_production_analysis": true,
  "minimum_supported_client_version": null,
  "recommended_client_version": null
}
```

响应中的旧扁平 capability 字段仍保留兼容性。第三方私信默认关闭；此时 `messages.third_party_access` 为 `false`，访问会返回 `403 THIRD_PARTY_ACCESS_DISABLED`。
`multiplayer` 中的开关分别表示在线状态、活动状态、会话、邀请、中继和第三方联机能力是否启用；`cloud_saves_v1` 表示云存档服务是否启用。它们只是站点能力提示，不会代替相应 OAuth 权限范围或应用能力审核。

## 当前用户与可执行操作

`GET /api/v1/me` 需要 `profile` 权限范围。首次在论坛建立账号只需 `profile`；邮箱权限范围独立可选。除了兼容字段外，响应增加 `verification.phone` 与 `permissions`：

```json
{
  "verification": { "phone": true },
  "permissions": {
    "thread_create": { "allowed": true, "reason": null },
    "reply_create": { "allowed": true, "reason": null },
    "resource_upload": { "allowed": false, "reason": "PHONE_VERIFICATION_REQUIRED" },
    "message_read": { "allowed": false, "reason": "THIRD_PARTY_ACCESS_DISABLED" }
  }
}
```

可用 reason 包括 `USER_BANNED`、`TERMS_ACCEPTANCE_REQUIRED`、`FEATURE_DISABLED`、`RESOURCE_UPLOAD_DISABLED`、`PHONE_VERIFICATION_REQUIRED`、`MESSAGING_DISABLED` 和 `THIRD_PARTY_ACCESS_DISABLED`。`permissions` 是界面提示，不是授权凭证；每个写接口仍会在请求时执行领域权限与审核策略。当前仓库没有独立的用户禁言实体或禁言服务。

## 论坛与内容

| 方法 | 路径 | 权限范围 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/threads?limit=20&offset=0` | `forum.read`（带 Bearer 时） | 分页讨论列表；匿名读取仍可用 |
| GET | `/api/v1/threads?q=search&limit=20` | `forum.read` | 搜索交由既有搜索服务 |
| GET | `/api/v1/threads/{id}` | `forum.read`（带 Bearer 时） | 详情；仍包含兼容的首批回复 |
| GET | `/api/v1/threads/{id}/replies?page=1&limit=20` | `forum.read`（带 Bearer 时） | 回复独立分页，不移除详情内回复 |
| POST | `/api/v1/threads` | `forum.write` | 创建讨论 |
| POST | `/api/v1/threads/{id}/replies` | `forum.write` | 创建回复 |
| POST | `/api/v1/uploads/images` | `forum.write` | 正文图片上传；还受图片上传站点开关控制 |

讨论、回复和资源的长文本字段提供兼容 Markdown/HTML 字段，以及 `content_format: "tiptap_json"`、`content_schema_version`、`content_json`、`content_html`、`content_text`。新客户端应写入 `content_schema_version: 2` 与 `content_json`；JSON 是正文的规范来源，Markdown `content` 只作为兼容、搜索、通知等用途的投影。服务端会按版本校验 ProseMirror 节点、格式标记、URL 和属性，再重新生成安全 HTML。旧客户端可以继续只传 `content`，服务端会将 Markdown 转换为 V2 JSON。

创建或更新内容时发送 `content_schema_version: 2` 和 `content_json`；multipart 资源请求把 JSON 字段编码成字符串，并额外发送 `content_schema_version=2`。节点、格式标记、附件草稿、站点视频来源和安全规则见[富文本格式 V2](./rich-content-schema-v2.md)。写请求继续遵循手机号验证、条款、封禁、分类权限、讨论锁定、审核和速率限制。帖子是否进入待审核由现有帖子服务决定。

旧客户端仍可只提交 Markdown `content`，服务端会在兼容路径中生成 V2 规范 JSON。该兼容输入不表示 Markdown 是新内容的唯一事实来源。

## 资源中心

公开读取使用稳定 `public_id`：

- `GET /api/v1/resources?limit=20&offset=0&q=...` — `resource.read`
- `GET /api/v1/resources/{public_id}` — `resource.read`
- `GET /api/v1/resources/{public_id}/manifest` — `resource.read`
- `GET /api/v1/resources/{resource_public_id}/versions/{version_public_id}/files/{file_public_id}/download` — `resource.download`

清单顶层保留已发布字段，并增加 `schema_version`、`type` 和 `resource` 对象。客户端应按清单中的可用文件、尺寸与 SHA-256 校验结果安装文件，不依赖服务器磁盘路径。

资源写入使用与所有者绑定的持久化草稿和现有资源审核服务：

1. 普通文件 `POST /api/v1/resources/drafts`，multipart 字段 `resource_kind`、`file`。
2. 地图/蓝图预解析 `POST /api/v1/resources/drafts/preview`，multipart 字段 `resource_kind` 和 `file`，蓝图也可传 `schematic_code`。
3. `GET /api/v1/resources/drafts/{draft_id}` 读取草稿；`PATCH` 可更新 `title`、`version`、`description`、`content`、`content_json`、`category_id`、`is_public`。
4. `POST /api/v1/resources/drafts/{draft_id}/submit` 提交给既有审核流程；放弃时用 `DELETE /api/v1/resources/drafts/{draft_id}`。
5. 地图/蓝图预览地址只对草稿所有者可读，使用 `Cache-Control: private, no-store`。

草稿文件保留在隔离的隔离区存储；API 不返回本地路径。草稿 30 分钟过期，每个用户最多保留 5 个活动草稿，旧草稿会被清理。上传需要 `resource.upload`，还受资源类型策略、手机号、站点开关和审核策略约束。

## 通知与私信

| 方法 | 路径 | 权限范围 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/notifications?page=1&limit=20` | `notification.read` | 通知列表 |
| GET | `/api/v1/notifications/unread-count` | `notification.read` | 未读数量 |
| PUT | `/api/v1/notifications/{id}/read` | `notification.read` | 标记已读 |
| PUT | `/api/v1/notifications/read-all` | `notification.read` | 全部标记已读 |
| GET | `/api/v1/messages?limit=20` | `message.read` | 私信会话，游标分页 |
| GET | `/api/v1/messages/unread-count` | `message.read` | 私信未读数量 |
| GET | `/api/v1/messages/{user_id}?limit=20` | `message.read` | 与用户的对话 |
| POST | `/api/v1/messages` | `message.write` | 发送私信 |

SSE 能力当前为 `false`。私信除权限范围外还要求全站私信启用；第三方 OAuth 客户端还必须由站点显式开启 `feature_messages_third_party_access_enabled`。

## 调用示例

以下示例展示取得 MindAuth 令牌后访问论坛。PKCE 授权码交换和刷新请求体见 [MindAuth PKCE 指南](https://github.com/mdtbbs/MindAuth/blob/main/docs/public-client-pkce.md)。不要在客户端硬编码令牌；正式应用应使用平台安全存储，并处理刷新令牌轮换。

### curl

```bash
curl --fail-with-body "$FORUM_BASE_URL/api/v1/capabilities"

curl --fail-with-body "$FORUM_BASE_URL/api/v1/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

curl --fail-with-body "$FORUM_BASE_URL/api/v1/threads?limit=20&offset=0" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### JavaScript / TypeScript

```ts
const response = await fetch(`${forumBaseUrl}/api/v1/me`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (!response.ok) {
  const error = await response.json();
  throw new Error(`${response.status} ${error.error?.code ?? 'REQUEST_FAILED'}`);
}
const me = await response.json();
```

### Java 11+

```java
var request = java.net.http.HttpRequest.newBuilder()
    .uri(java.net.URI.create(forumBaseUrl + "/api/v1/me"))
    .header("Authorization", "Bearer " + accessToken)
    .GET().build();
var response = java.net.http.HttpClient.newHttpClient()
    .send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
if (response.statusCode() / 100 != 2) {
    throw new IllegalStateException("Forum API returned " + response.statusCode() + ": " + response.body());
}
```

### Kotlin (JVM)

```kotlin
val connection = java.net.URL("$forumBaseUrl/api/v1/me").openConnection() as java.net.HttpURLConnection
connection.setRequestProperty("Authorization", "Bearer $accessToken")
connection.requestMethod = "GET"
val status = connection.responseCode
val stream = if (status in 200..299) connection.inputStream else connection.errorStream
val body = stream.bufferedReader().use { it.readText() }
if (status !in 200..299) error("Forum API returned $status: $body")
connection.disconnect()
```

成功的 JSON 响应默认使用 V1 响应封装；数组型旧响应可能直接返回数组，同时由 `meta.pagination` 提供分页。错误处理应依据 HTTP 状态码和 `error.code`。

## 兼容与迁移

- 新的第三方客户端必须使用自己的 MindAuth 公开客户端和授权码模式 + PKCE，不依赖第一方兼容登录能力或预授予权限。
- MindAuth OAuth Bearer 令牌只按服务端令牌内省结果中的权限范围授权。
- `openapi-v1.json` 中受 OAuth 保护的操作声明 `MindAuthBearer` 安全方案与 `x-required-scopes`；匿名读取操作用匿名或 Bearer 两种安全方案表达，并以 `x-oauth-scopes-if-bearer` 说明携带令牌时的权限范围校验。
- `GET /api/v1/threads/{id}` 的内嵌回复保留；新客户端可以使用独立分页接口。
- `content` Markdown 和已发布的 capability 扁平别名保留；JSON 富文本与嵌套 capabilities 为新增字段。
- OpenAPI 只包含 `/api/v1/*` 稳定契约；`/api/openapi/v1.json` 是机器可读版本。

第一方官方客户端可以维护自己的客户端配置与迁移策略；第三方应用应在 MindAuth 开发者中心注册独立公开客户端、登记自己的重定向地址，并只使用自己实际获批的权限范围。
