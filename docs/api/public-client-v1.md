# MDTBBS Public Client API V1

本指南面向 Web、Android、桌面客户端、Mindustry Mod 和第三方启动器。所有应用使用同一套 MindAuth OAuth Authorization Code + PKCE S256 和 `/api/v1/*`；客户端名称不会带来额外权限。

线上接入入口是 [`/api/v1/docs/oauth`](https://mdtbbs.cn/api/v1/docs/oauth)，里面直接列了申请应用、Redirect URI、PKCE、scope、换 token、refresh 和 revoke。需要更完整的协议细节与 Java/Kotlin PKCE 示例时，再看 [MindAuth Public Client PKCE 指南](https://github.com/mdtbbs/MindAuth/blob/main/docs/public-client-pkce.md)。MindFourm 的 OpenAPI 契约位于 `/api/openapi/v1.json`。

## 1. 接入顺序

1. 登录并完成手机号验证，在 MindAuth 开发者中心自助创建 Public Client。创建后立即取得 `client_id`，无需管理员审核；Public Client 没有 `client_secret`，创建接口按 IP 限流。
2. 注册精确 Redirect URI 和所需 scopes。桌面 loopback 支持 `127.0.0.1`、`[::1]` 和 `localhost`；以端口 `0` 注册可匹配运行时随机端口，其他内网地址不允许。
3. 客户端生成随机 PKCE verifier，计算 S256 challenge，使用系统浏览器打开 MindAuth `/api/authorize`，并验证返回的 `state`。
4. 使用 authorization code、相同 `redirect_uri`、verifier 和 `client_id` 调用 MindAuth `/api/token`。
5. 将 access token 作为 `Authorization: Bearer` 调用 MindFourm。Forum 服务端通过保密的 Resource Server 凭据 introspect opaque token；客户端不解析 token，也不接触 Forum 的 `MINDAUTH_CLIENT_SECRET`。
6. access token 过期后通过标准 `/api/token` 的 `grant_type=refresh_token` 轮换 refresh token；退出或解除授权调用 MindAuth `/api/revoke` 或用户的“已授权应用”页面。

不要把 MindAuth 密码、External API Key、服务端密钥或 client secret 放进客户端。注册和账号验证始终在 MindAuth Web 完成。

## 2. Scope

只申请产品需要的 scope。开发者修改的 scope 立即生效；MindAuth 授权页面会展示权限中文说明，首次授权时展示全部权限，新增 scope 时只强调新增项。`message.read` 和 `message.write` 会标为敏感权限，但不需要人工审核。

| Scope | 用途 | MindFourm API |
| --- | --- | --- |
| `openid` | OIDC 身份标识 | MindAuth 登录流程 |
| `profile` | 用户基本资料 | `GET /api/v1/me`、修改本人资料和头像；首次在论坛建立本地身份时需要 |
| `email` | 邮箱声明 | MindAuth UserInfo 邮箱兼容 scope，可选；首次建立论坛身份不需要 |
| `forum.read` | 读取论坛 | threads、replies、search、公开用户资料、reports 查询、bookmarks 查询 |
| `forum.write` | 论坛写入 | 创建/编辑/删除 thread 与 reply、reports 提交、feedback、图片上传 |
| `resource.read` | 读取资源 | 资源列表、详情、manifest、预览 |
| `resource.download` | 下载资源文件 | Resource V1 文件下载 |
| `resource.upload` | 提交资源 | Resource Draft、地图/蓝图预览和提交 |
| `notification.read` | 读取和处理通知 | notifications V1 |
| `message.read` | 读取私信 | messages V1 读取接口 |
| `message.write` | 发送私信 | `POST /api/v1/messages` |

scope 表示客户端被允许请求某一类操作，不替代 Forum 的用户权限、手机号验证、社区条款、站点开关、封禁、内容审核、资源策略或私信开关。失败时读取 HTTP 状态和稳定 `error.code`；不要匹配中文消息。

MindFourm 对 opaque Bearer 的 introspection 与 UserInfo 身份信息使用 Redis 缓存 30 秒，缓存 key 是 access token 的 SHA-256 摘要。MindAuth 撤销 token 或应用后，已缓存的论坛 API 身份最迟在 30 秒内失效。API V1 缺少 scope 时返回统一错误 envelope：`error.code` 为 `INSUFFICIENT_SCOPE`，`error.details` 包含 `{ "requiredScopes": ["resource.upload"] }`。

## 3. Capability discovery

`GET /api/v1/capabilities` 不需要认证。能力受 Forum 站点设置控制，运行时可能变化；`true` 也不代表当前用户已有对应 OAuth scope 或本地写入权限。

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

## 4. 当前用户与权限

`GET /api/v1/me` 需要 `profile` scope。首次在论坛建立账号只需 `profile`；邮箱 scope 独立可选。除了兼容字段外，响应增加 `verification.phone` 与 `permissions`：

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

可用 reason 包括 `USER_BANNED`、`TERMS_ACCEPTANCE_REQUIRED`、`FEATURE_DISABLED`、`RESOURCE_UPLOAD_DISABLED`、`PHONE_VERIFICATION_REQUIRED`、`MESSAGING_DISABLED` 和 `THIRD_PARTY_ACCESS_DISABLED`。`permissions` 是 UI 提示，不是授权凭证；每个写接口仍会在请求时执行领域权限与审核策略。当前仓库没有独立的用户禁言实体或禁言服务。

## 5. Forum 与内容

| Method | Path | Scope | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/threads?limit=20&offset=0` | `forum.read`（带 Bearer 时） | 分页 thread 列表；匿名读取仍可用 |
| GET | `/api/v1/threads?q=search&limit=20` | `forum.read` | 搜索交由既有 SearchService |
| GET | `/api/v1/threads/{id}` | `forum.read`（带 Bearer 时） | 详情；仍包含兼容的首批 replies |
| GET | `/api/v1/threads/{id}/replies?page=1&limit=20` | `forum.read`（带 Bearer 时） | replies 独立分页，不移除详情内 replies |
| POST | `/api/v1/threads` | `forum.write` | 创建 thread |
| POST | `/api/v1/threads/{id}/replies` | `forum.write` | 创建 reply |
| POST | `/api/v1/uploads/images` | `forum.write` | 正文图片上传；还受图片上传站点开关控制 |

Thread/reply/资源长描述提供兼容 Markdown/HTML 字段和 `content_format: "tiptap_json"`、`content_schema_version`、`content_json`、`content_html`、`content_text`。新客户端应写入 `content_schema_version: 2` 与 `content_json`；JSON 是正文的规范来源，Markdown `content` 只作为兼容、搜索、通知等投影。服务端会按版本校验 ProseMirror 节点、marks、URL 和属性，再重新生成安全 HTML。旧客户端可以继续只传 `content`，服务端会将 Markdown 转换为 v2 JSON。

创建/更新内容时发送 `content_schema_version: 2` 和 `content_json`；multipart Resource 请求把 JSON 字段编码成字符串，并额外发送 `content_schema_version=2`。节点、marks、附件 draft、站点视频 provider 和安全规则见 [Rich Content Schema v2](./rich-content-schema-v2.md)。写请求继续遵循手机号验证、条款、ban、分类权限、thread 锁定、审核和速率限制。帖子是否进入待审核由现有帖子服务决定。

旧客户端仍可只提交 Markdown `content`，服务端会在兼容路径中生成 v2 canonical JSON。该兼容输入不表示 Markdown 是新内容的 source of truth。

## 6. Resource V1

公开读取使用稳定 `public_id`：

- `GET /api/v1/resources?limit=20&offset=0&q=...` — `resource.read`
- `GET /api/v1/resources/{public_id}` — `resource.read`
- `GET /api/v1/resources/{public_id}/manifest` — `resource.read`
- `GET /api/v1/resources/{resource_public_id}/versions/{version_public_id}/files/{file_public_id}/download` — `resource.download`

Manifest 顶层保留已发布字段，并增加 `schema_version`、`type` 和 `resource` 对象。客户端应按 manifest 中的可用文件、尺寸与 SHA-256 校验结果安装文件，不依赖服务器磁盘路径。

资源写入使用 owner-bound 持久化草稿和现有资源审核服务：

1. 普通文件 `POST /api/v1/resources/drafts`，multipart 字段 `resource_kind`、`file`。
2. 地图/蓝图预解析 `POST /api/v1/resources/drafts/preview`，multipart 字段 `resource_kind` 和 `file`，蓝图也可传 `schematic_code`。
3. `GET /api/v1/resources/drafts/{draft_id}` 读取草稿；`PATCH` 可更新 `title`、`version`、`description`、`content`、`content_json`、`category_id`、`is_public`。
4. `POST /api/v1/resources/drafts/{draft_id}/submit` 提交给既有 moderation lifecycle；放弃时用 `DELETE /api/v1/resources/drafts/{draft_id}`。
5. 地图/蓝图预览地址只对草稿所有者可读，使用 `Cache-Control: private, no-store`。

草稿文件保留在隔离的 quarantine 存储；API 不返回本地路径。草稿 30 分钟过期，每个用户最多保留 5 个活动草稿，旧草稿会被清理。上传需要 `resource.upload`，还受资源类型策略、手机号、站点开关和审核策略约束。

## 7. Notifications 与 Messages

| Method | Path | Scope | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/notifications?page=1&limit=20` | `notification.read` | 通知列表 |
| GET | `/api/v1/notifications/unread-count` | `notification.read` | 未读数量 |
| PUT | `/api/v1/notifications/{id}/read` | `notification.read` | 标记已读 |
| PUT | `/api/v1/notifications/read-all` | `notification.read` | 全部标记已读 |
| GET | `/api/v1/messages?limit=20` | `message.read` | 私信会话，cursor 分页 |
| GET | `/api/v1/messages/unread-count` | `message.read` | 私信未读数量 |
| GET | `/api/v1/messages/{user_id}?limit=20` | `message.read` | 与用户的对话 |
| POST | `/api/v1/messages` | `message.write` | 发送私信 |

SSE capability 当前为 `false`。私信除 scope 外还要求全站私信启用；第三方 OAuth 客户端还必须由站点显式开启 `feature_messages_third_party_access_enabled`。

## 8. 调用示例

以下示例展示取得 MindAuth token 后访问 Forum。PKCE code exchange 和 refresh 请求体见 [MindAuth PKCE 指南](https://github.com/mdtbbs/MindAuth/blob/main/docs/public-client-pkce.md)。不要在客户端硬编码 token；生产应用应使用平台安全存储，并处理 refresh rotation。

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

成功 JSON 默认通过 V1 envelope 返回；数组型旧响应可能直接返回数组，同时由 `meta.pagination` 提供分页。错误控制流使用 HTTP 状态码和 `error.code`。

## 9. 兼容与迁移

- `/api/v1/auth/mobile/exchange`、`/refresh` 与 Forum mobile JWT 继续服务已有 Android 客户端；新客户端使用 MindAuth Public Client PKCE。旧接口目前仍受支持，没有因本次升级被删除。
- `forum_session` 与 mobile legacy 凭证由 Forum 服务端赋予第一方兼容 capability；MindAuth OAuth Bearer 则只按实际 introspection 返回的 scope 授权。
- `openapi-v1.json` 中受 OAuth 保护的操作声明 `MindAuthBearer` 安全方案与 `x-required-scopes`；匿名读取操作用匿名或 Bearer 两种安全方案表达，并以 `x-oauth-scopes-if-bearer` 说明携带 token 时的 scope 校验。
- `GET /api/v1/threads/{id}` 的内嵌 replies 保留；新客户端可以使用独立分页 endpoint。
- `content` Markdown 和已发布的 capability 扁平别名保留；JSON 富文本与嵌套 capabilities 为新增字段。
- OpenAPI 只包含 `/api/v1/*` 稳定契约；以 `/api/openapi/v1.json` 为机器可读来源。

### 官方 Android

Android Public Client 使用精确 Redirect URI `mdtbbs://oauth/callback`。MindAuth migration `013_seed_official_android_public_client.sql` 会创建已批准的官方 first-party Public Client `mdtbbs_android_public` 并登记 Android 默认请求的 scopes。新版本 Android 默认使用该 ID；应用前先部署 MindAuth migrations。需要切换到其他已批准客户端时，只配置公开 `client_id`：

```properties
mdtbbsOauthClientId=<approved-public-client-id>
mdtbbsMindAuthBaseUrl=https://auth.mdtbbs.cn/
```

`mdtbbsOauthAuthorizationEndpoint`、`mdtbbsOauthScopes` 和 `mdtbbsMindAuthRegistrationUrl` 可按部署覆盖。不要定义或打包任何 `client_secret`。当构建没有 Public Client ID 时，Android 暂时保留已有 Native Auth + Forum mobile token 登录；已保存的未加版本前缀 refresh token 继续走 Forum legacy refresh，新 OAuth refresh token 加密保存并固定走 MindAuth rotation。
