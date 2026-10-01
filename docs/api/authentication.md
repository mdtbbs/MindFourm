# API 身份认证与凭证

MindFourm 支持 OAuth 访问令牌、浏览器会话、移动端令牌和服务端 API Key。新客户端应使用 MindAuth Authorization Code + PKCE S256。论坛服务端验证令牌后，再按 OAuth scope 和论坛自身策略判断请求是否可执行。

## 新客户端：MindAuth Public Client 令牌

官方新客户端和第三方客户端在 MindAuth 开发者中心注册 Public Client，通过系统浏览器执行 Authorization Code + PKCE S256，随后携带 access token 调用 `/api/v1/*`：

```http
Authorization: Bearer <mindauth-access-token>
```

论坛服务端使用仅保存在服务器上的 `MINDAUTH_CLIENT_ID` / `MINDAUTH_CLIENT_SECRET` 向 MindAuth 验证令牌，再检查令牌是否有效、用户与客户端身份，以及实际授予的 scope。论坛通过 MindAuth UserInfo 获取账号资料并同步本地用户；客户端令牌本身是不透明字符串，论坛不会在本地解码。第三方客户端不需要、也不能获取论坛服务端凭据。

论坛会在 Redis 中缓存令牌验证结果和必要的 UserInfo 字段 30 秒。缓存键由 access token 的 SHA-256 摘要生成；令牌撤销或应用停用后，已缓存的身份信息最多再保留 30 秒。首次在论坛建立本地用户只需要 `profile`；`email` 是可选权限。

新客户端可以先看在线的[第三方客户端授权指南](https://mdtbbs.cn/api/v1/docs/oauth)，其中说明应用申请、Redirect URI、PKCE、scope、令牌刷新和撤销。仓库中的[客户端接入指南](./public-client-v1.md)介绍论坛 API 的行为；MindAuth 协议细节见 [Public Client PKCE 指南](https://github.com/mdtbbs/MindAuth/blob/main/docs/public-client-pkce.md)。

浏览器会话和旧版 Forum Mobile JWT 按第一方兼容规则授权；MindAuth OAuth 令牌只能使用 MindAuth 实际授予的 scope。无论使用哪种凭证，论坛仍会检查用户封禁、手机号验证、社区条款、内容审核和站点设置。

## 浏览器论坛会话

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

## 移动端 Bearer 令牌（兼容路径）

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

## 既有游戏内容令牌兼容

`/api/v1/game-content/*` 当前与其他 `/api/v1/*` 路由共用 MindAuth Bearer 解析器和 AuthContext。MindAuth Bearer 可以访问符合其 scope 与 Forum policy 的 V1 操作；既有 first-party Native Auth token 中历史 scope `game_content` 仍会映射到对应资源 scope，以保证已发布客户端兼容。

请求可以携带：

```http
Authorization: Bearer <mindauth-access-token>
```

论坛不会本地解码这个 token，而是调用 MindAuth introspection 和 userinfo 验证，再把 MindAuth identity 映射或同步到论坛本地用户。

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

## 外部服务 API Key

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

## 手机号、封禁与社区条款

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

## 服务端内部凭证

后端还存在一些只应由受信服务使用的 header，例如：

```http
X-Forum-Internal-Key: ...
X-Service-Key: ...
```

`X-Forum-Internal-Key` 可用于可信 SSR / 内部调用绕过普通用户限流。生产环境必须让源站只接受可信 CDN 或私网入口，否则攻击者可能伪造代理头。

这些密钥不是面向终端客户端的认证方案。
