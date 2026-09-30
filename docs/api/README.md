# MDTBBS API 文档

管理员跨站资源导入/导出使用 legacy 管理接口，具体格式和文件处理流程见[跨站资源迁移文档](../resources-cross-site-transfer.md)。

本目录是 MindFourm 当前 API 的开发者入口。

如果你正在做 Web、Android、桌面客户端、Mindustry Mod、Xenon Launcher 或其他第三方客户端，使用 MindAuth Authorization Code + PKCE 后调用 `/api/v1/*`。Xenon 没有专属鉴权分支。
如果你正在做机器人、同步服务或后台自动化，使用 `/api/external/v1/*`。
除非你正在维护论坛本体，否则不要把未文档化的 `/api/*` legacy 路由当成长期稳定契约。

## 1. API 分层

| 层级 | 基础路径 | 面向对象 | 稳定性 |
| --- | --- | --- | --- |
| Public Client V1 | `/api/v1` | Web、官方客户端、Mindustry Mod、第三方启动器 | 稳定契约；scope 与论坛策略共同控制 |
| External API | `/api/external/v1` | QQ/Discord/Telegram 机器人、同步服务、服务端集成 | 受 scope 约束的服务端契约 |
| Legacy / internal | `/api/*` | 论坛现有前端、后台、历史兼容代码 | 不承诺给第三方长期兼容 |
| Service callbacks | 例如 `/api/service-api/*`、`/api/auto-post/*` | 受信任服务间调用 | 私有部署契约 |

第一方客户端不要因为源码里存在某个 legacy endpoint 就直接依赖它。V1 是否可用还要结合 capability 判断。

## 2. 文档入口

生产或开发环境在 `OPENAPI_ENABLED != false` 时提供：

- 在线开发者入口：`/api/v1`
- 只读 API Reference：`/api/v1/reference`
- Swagger 只读视图：`/api/docs/v1`（禁用 Try it）
- OpenAPI JSON：`/api/openapi/v1.json`
- Capability discovery：`GET /api/v1/capabilities`

`/api/v1` 的在线文档只展示公开稳定契约。Legacy、管理端和服务间接口不会出现在公开导航中。

仓库内文档：

- [First-party V1 参考](./first-party-v1.md)
- [Public Client 快速接入](./public-client-v1.md)
- [Rich Content Schema v2](./rich-content-schema-v2.md)
- [认证与凭证](./authentication.md)
- [Game Content V1](./game-content-v1.md)
- [Resource V1 契约](./resources-v1-contract.md)
- [External API](./external.md)
- [资源评论 API](./social-resource-comments.md)
- [源码接口总表](./API_REFERENCE.md)

`API_REFERENCE.md` 是全仓库接口盘点，不等于公开稳定 API。第三方客户端的契约边界以 V1 OpenAPI 和本目录明确标注的文档为准。

## 3. V1 响应格式

普通 V1 JSON 成功响应统一为：

```json
{
  "data": {},
  "meta": {
    "request_id": "req_..."
  }
}
```

带标准分页元信息的接口可以附加：

```json
{
  "data": {},
  "meta": {
    "request_id": "req_...",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 123,
      "total_pages": 7
    }
  }
}
```

错误响应统一为：

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "请求参数无效",
    "retryable": false,
    "details": []
  },
  "meta": {
    "request_id": "req_..."
  }
}
```

客户端控制流应读取 `error.code` 和 HTTP 状态码，不要匹配中文 `message`。

### 原始响应例外

文件、图片和重定向类接口可能标记为 raw response，不使用上述 JSON envelope，例如：

- Game Content 地图实际文件下载
- 蓝图/地图预览图片
- 资源预览图片
- 文件重定向

调用方应根据 `Content-Type`、HTTP 状态码和响应头处理。

## 4. 认证方式

不同 API 不共用同一种凭证。

| 场景 | 凭证 |
| --- | --- |
| 浏览器论坛会话 | `forum_session` Cookie |
| Android / 第一方移动端 | Forum mobile Bearer token |
| Public Client V1 | MindAuth Public Client access token，`Authorization: Bearer ...`；服务端 introspection 并按 scopes 校验 |
| Existing Android clients | Forum mobile Bearer token（兼容路径，逐步迁移到 MindAuth Public Client） |
| Browser forum session | `forum_session` Cookie（第一方兼容） |
| External API | External API Key，Bearer 或 `X-API-Key` |
| 受信服务间调用 | 对应服务私钥头，例如 `X-Service-Key` |

详细流程见 [authentication.md](./authentication.md)。

特别注意：当前源码中的 `POST /api/auth/validate-credentials` 是服务端接口，必须先通过 External API Key，并要求 `lanlink:auth` 或 `backupsave:auth` scope。它会向 MindAuth 校验用户名和密码，但不会向普通 Mod 签发 Game Content Bearer token，因此不能把它当作公开 Mod 登录接口。

## 5. Capability-first

客户端启动后应先请求：

```http
GET /api/v1/capabilities
```

能力以嵌套对象表达 forum、resources、notifications、messages、game_content 与 client 状态。已发布的扁平字段（例如 `resource_read`、`resource_files`、`download_grants`、`notifications_v1`）暂时保留为兼容别名。具体字段见 [Public Client V1 接入指南](./public-client-v1.md#capability-discovery)。

能力为 `false` 时，客户端应隐藏或禁用依赖功能，而不是尝试调用未启用接口。

`GET /api/v1/client/config?platform=android&version_code=...` 提供移动端最低版本、最新版本、强制更新、维护状态和客户端功能开关。

## 6. 兼容性约定

V1 遵循以下规则：

1. 已文档化字段不会在 V1 内无预告重命名或改变语义。
2. 可以新增可选字段，客户端必须忽略未知字段。
3. 删除字段、改变必填关系、改变身份语义时应进入新版本。
4. HTTP 状态码和 `error.code` 是错误控制流的稳定入口。
5. Capability 可以临时关闭某个功能，功能关闭不代表 endpoint 永久删除。
6. Resource、Game Content 等跨客户端对象优先使用稳定 public id；不要把数据库自增 ID 当成跨系统身份。
7. 文件下载必须校验 hash、可用状态和服务端返回的能力信息。
8. Preview 失败不应让原始资源本身变成不可用。

## 7. 限流

全局默认：

- 读请求：`1200 / 60s`
- 写请求：`180 / 60s`

控制器可以声明更严格的限制。Game Content 常见限制见 [game-content-v1.md](./game-content-v1.md)。

响应可能包含：

```http
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
Retry-After: 60
```

达到限制后返回 HTTP `429`。V1 中会转换为 `RATE_LIMITED` 错误码，并标记 `retryable: true`。

## 8. OpenAPI 维护规则

`src/openapi/v1-openapi.ts` 是 V1 文档生成入口。

V1 OpenAPI 必须只暴露 `/v1/*` 路径。部分 Nest module 同时包含 legacy controller，因此生成后会执行路径过滤，避免 `/resources`、`/reports`、`/feedback` 等历史路由混入第一方稳定契约。

修改 V1 controller 或 DTO 时：

1. 同步补充 Swagger decorator 和 DTO schema。
2. 检查 `/api/openapi/v1.json` 是否只包含 `/v1/*`。
3. 更新对应 Markdown 文档中的行为说明、限制和示例。
4. 若仓库提交 `openapi-v1.json` 快照，重新导出后再提交。
5. 不要手工把 legacy endpoint 加进 V1 文档来解决客户端需求，应先设计稳定 V1 endpoint。

## 9. 源码中的已知边界

以下内容容易混淆，但现在不是同一件事：

- `Resources V1` 是通用资源读取、manifest 和持久化上传草稿契约。
- `Game Content V1` 是专门给蓝图和地图客户端使用的体验型 API，包含搜索、Feed、收藏、点赞、上传和文件下载。
- `External API` 是服务端机器人接口，不应把 API Key 放进 Mod、网页 bundle 或桌面客户端发行包。
- 新客户端使用 MindAuth Authorization Code + PKCE S256；当前 Forum mobile exchange 和 Forum mobile JWT 继续作为兼容路径，不会因本次升级突然失效。
- `notifications_v1` 已纳入 First-party V1 OpenAPI，默认 capability 为 `true`，并受 `feature_notifications_v1_enabled` 控制；SSE 目前仍为 `false`。
