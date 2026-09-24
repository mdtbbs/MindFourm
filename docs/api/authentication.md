# API 认证与凭证

MindFourm 当前有多套认证机制。它们服务于不同客户端，不能互相替代。

## 1. 浏览器 forum session

浏览器 OAuth SSO 完成后，论坛写入：

```http
Cookie: forum_session=<opaque-session-token>
```

Cookie 为 HttpOnly。论坛后端从 Redis session 解析用户，并在已有 MindAuth OAuth token 时刷新本地用户资料。

适用：

- Web 前端
- 同源 SSR
- legacy Web API
- 部分 `/api/v1/*` endpoint

客户端不应读取、复制或持久化这个 HttpOnly Cookie 到其他应用。

## 2. Forum mobile Bearer

Android / 原生客户端使用 MindAuth native authorization code 流程。

交换：

```http
POST /api/v1/auth/mobile/exchange
Content-Type: application/json

{
  "code": "<native-authorization-code>",
  "code_verifier": "<pkce-verifier>",
  "device_name": "My Phone"
}
```

成功后获得 Forum 自己签发的短期 access token 和可轮换 refresh token。

Access token 用法：

```http
Authorization: Bearer <forum-mobile-access-token>
```

当前实现：

- access token 有效期：30 分钟
- refresh token 有效期：90 天
- refresh token 单次使用并轮换
- 检测 refresh token reuse 后会撤销整个 token family / mobile session
- 可以列出和撤销设备会话

这个 token 由 `JwtAuthGuard` 识别，用于普通第一方论坛 V1。

## 3. Game Content 的 MindAuth Bearer

`/api/v1/game-content/*` 使用独立认证 guard。

请求可以携带：

```http
Authorization: Bearer <mindauth-access-token>
```

论坛不会本地解码这个 token，而是调用 MindAuth userinfo 验证，再把 MindAuth identity 映射或同步到论坛本地用户。

公开浏览接口允许不带 token。需要身份的接口会叠加 required-auth guard，例如：

- 上传蓝图
- 上传地图
- 点赞
- 收藏
- `GET /api/v1/game-content/me`
- 我的收藏和我的资源

需要写入社区内容时还会检查：

- 用户是否被封禁
- 手机号是否已验证
- 是否需要重新接受社区条款

### 当前 Mod 登录边界

当前仓库没有“普通 Mod 直接把用户名和密码提交给 `/api/v1/game-content`，然后由论坛返回 MindAuth access token”的公开接口。

源码里确实存在：

```http
POST /api/auth/validate-credentials
```

但它是服务端调用接口：

- 必须通过 External API Key
- 需要 `lanlink:auth` 或 `backupsave:auth` scope
- 服务端再调用 MindAuth `/service/validate-credentials`
- 返回的是 `valid + user`
- 不签发 Game Content Bearer token

因此第三方或游戏内 Mod 不应把这个 endpoint 当成公开登录 API，也不应把 External API Key 打进 jar。

如果后续要实现“Mod 内直接输入 MindAuth 用户名/密码”的产品方案，应新增专门的 V1 auth exchange，并由 MindAuth 明确提供面向受限客户端的凭证交换契约，而不是复用 service credential validation。

## 4. External API Key

External API 面向机器人和服务端集成。

推荐：

```http
Authorization: Bearer mfk_live_xxx.yyy
```

兼容：

```http
X-API-Key: mfk_live_xxx.yyy
```

API Key 具备：

- scopes
- 启停
- 过期
- IP 白名单
- 每分钟限流
- 默认 actor
- 审计日志
- 轮换

详细见 [external.md](./external.md)。

绝对不要把 External API Key 放进：

- 浏览器 JavaScript bundle
- Android APK 中的明文常量
- Mindustry Mod jar
- 公开 Git 仓库
- 客户端配置文件

## 5. 手机号、封禁与条款

认证成功不等于一定能写入。

全局写保护会对 `POST`、`PUT`、`PATCH`、`DELETE` 检查手机号验证状态，除非 endpoint 明确标记跳过。

可能出现：

```json
{
  "error": {
    "code": "PHONE_NOT_VERIFIED",
    "message": "请先验证手机号后再继续操作",
    "retryable": false,
    "details": []
  },
  "meta": {
    "request_id": "..."
  }
}
```

Game Content required-auth 还可能返回：

- `AUTH_REQUIRED`
- `INVALID_TOKEN`
- `PERMISSION_DENIED`
- `TERMS_ACCEPTANCE_REQUIRED`
- `USER_BANNED`

客户端应按 `code` 映射 UI。

## 6. 服务端内部凭证

后端还存在一些只应由受信服务使用的 header，例如：

```http
X-Forum-Internal-Key: ...
X-Service-Key: ...
```

`X-Forum-Internal-Key` 可用于可信 SSR / 内部调用绕过普通用户限流。生产环境必须让源站只接受可信 CDN 或私网入口，否则攻击者可能伪造代理头。

这些密钥不是面向终端客户端的认证方案。
