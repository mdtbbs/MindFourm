# RFC：MindFourm Android Mobile Auth

**状态：** Accepted；**决策：** Web Cookie 会话与 Android App Session 并存，共用同一用户、角色、封禁与手机号验证体系。

## 问题与目标

当前 Web 登录在 OAuth callback 后创建 Redis `forum_session`，浏览器以 HttpOnly Cookie 使用它；Guard 虽可解析 `Authorization: Bearer`，但把其值当作同一种 Redis session token 验证。这不提供移动 refresh、设备管理、令牌轮换或可审计的 App Session。

本 RFC 不改 MindAuth 用户身份源，不将密码交给 App，也不让 Android 保存或模拟 `forum_session` Cookie。

## 授权流程

```text
Android App -- authorization request + PKCE --> MindAuth
Android App <-- authorization code via claimed HTTPS App Link -- MindAuth
Android App -- code_verifier + code --> POST /api/v1/auth/mobile/exchange
MindFourm -- server-to-server code exchange --> MindAuth
MindFourm --> access_token + refresh_token + user + session
Android App -- Authorization: Bearer access_token --> /api/v1/*
```

App 使用授权码 + PKCE（S256），redirect URI 必须是已验证的 HTTPS App Link；不可使用裸自定义 scheme。`state`、`nonce`、PKCE verifier 与待跳转页面在 App 内临时保存并校验。

## 端点与令牌

```text
POST /api/v1/auth/mobile/exchange
POST /api/v1/auth/mobile/refresh
POST /api/v1/auth/mobile/logout
GET  /api/v1/auth/mobile/sessions
DELETE /api/v1/auth/mobile/sessions/{id}
```

`exchange` 输入为授权码、PKCE verifier、redirect URI、设备名称与 App 版本；服务端验证授权码、PKCE、audience/issuer、手机号与条款状态后创建会话。成功返回：

```json
{
  "data": {
    "access_token": "...",
    "access_token_expires_in": 1800,
    "refresh_token": "...",
    "refresh_token_expires_in": 7776000,
    "token_type": "Bearer",
    "session": { "id": "...", "device_name": "...", "created_at": "..." },
    "user": { "id": 1, "username": "...", "role": "user", "phone_verified": true }
  },
  "meta": { "request_id": "..." }
}
```

Access token 有效期 30 分钟、只放内存。Refresh token 有效期 90 天；Android Keystore 生成并保护 AES 密钥，App 使用 AES-GCM 加密 refresh token 后保存至 App 私有存储，不能把 token 本身直接当作 Keystore 条目。刷新采用一次性轮换：每次 `refresh` 成功即使旧 refresh token 失效；并发刷新要以客户端互斥和服务端 token family/reuse detection 处理。

## 服务端模型与 Guard

- 新增 `mobile_sessions` 与 `mobile_refresh_tokens`（或等价的独立会话域）；数据库只保存 `HMAC-SHA-256(server_secret, refresh_token)`、session id、用户、设备、IP、User-Agent、到期/撤销/替换时间，绝不保存原始 refresh token。
- access token 为签名 JWT，包含 `sub`、`sid`、`iat`、`exp`、`aud=android`、`iss`、`jti`；密钥轮换使用 `kid`。
- 新建 `MobileBearerAuthGuard` 或扩展现有 Guard，明确区分 Cookie session、旧 Bearer Redis session 与 V1 mobile JWT；验证 audience、签名、过期、会话撤销和用户封禁后才设置 `request.user`。
- 写操作仍运行当前的手机号验证、角色、封禁和限流规则。`PHONE_NOT_VERIFIED` 继续是结构化可处理错误。
- 复用 SessionAudit 的“哈希令牌、登录/登出审计”原则，并补充设备会话 revoke/refresh-reuse 审计；不可把 MindAuth access/refresh token 写入移动会话 Redis hash。

## 登出、设备与异常处理

- 当前设备登出：撤销当前 mobile session 与 token family，删除 Keystore refresh token，清空内存 access token 和本地用户私有缓存。
- 踢下线：用户只能删除自己的 `session.id`；服务端撤销后，下一次 API 或 SSE 连接返回 `SESSION_REVOKED`/401。
- 401：OkHttp Authenticator 使用单飞（single-flight）刷新一次；刷新失败立即进入未登录态。非幂等请求不可自动盲重放。
- 令牌泄露或 refresh reuse：撤销整个 token family，记录安全事件并要求重新 OAuth 登录。

## SSE 与限制

EventSource 通常不能自定义 Authorization Header；Android 使用 OkHttp 流式请求连接 `GET /api/v1/notifications/events` 并带 Bearer Header。服务端不得允许 access token 放在 URL query 中。

移动端请求应设置稳定但非敏感的 `X-Client-Platform: android`、`X-Client-Version` 与 `User-Agent`。设备标识是服务器生成的 session id，不采集 IMEI、Android ID 等持久硬件标识。

## 验收与迁移

必须覆盖 PKCE 失败、过期/已消费授权码、错误 audience、过期 access、refresh 轮换、refresh reuse、登出、跨设备撤销、封禁、未验证手机、SSE 401 和 Web Cookie 回归。Web `/api/auth/*` 与 `forum_session` 行为不变；Android 仅调用新增 `/api/v1/auth/mobile/*`。
