# MDTBBS API 开发者文档

这里介绍 MindFourm 的第三方 Public Client API，包括适用场景、认证方式、请求参数与响应格式。论坛用户页面不提供 API 导航；本入口面向开发者。

Web、Android、桌面端、Mindustry Mod、启动器等客户端通过 MindAuth Authorization Code + PKCE 获取访问令牌，再调用 Public Client V1。获准的服务端集成凭证另行管理，不属于第三方 Public Client API。

未在公开文档中列出的 `/api/*` 历史接口不属于第三方稳定契约；只有维护论坛本体时才应直接依赖它们。

## API 分层

| 接口 | 基础路径 | 面向对象 | 稳定性 |
| --- | --- | --- | --- |
| Public Client V1 | `/api/v1` | Web、官方客户端、Mindustry Mod、第三方启动器 | 稳定契约；OAuth scope 与论坛策略共同控制 |
| 历史与内部接口 | `/api/*` | 论坛前端、后台和兼容代码 | 不承诺长期兼容第三方 |
| 服务间集成 | 受信任的服务端调用 | 私有部署契约 |

客户端不要因为源码中存在某个历史接口就依赖它。调用 V1 功能前，还要检查服务端当前公布的能力。

## 文档入口

生产或开发环境在 `OPENAPI_ENABLED != false` 时提供：

- 在线开发者文档：`/api/v1`
- API 参数参考：`/api/v1/reference`
- Swagger 文档：`/api/docs/v1`（只读，不提供在线调用）
- OpenAPI JSON：`/api/openapi/v1.json`
- 明确命名的 Public OpenAPI：`/api/openapi/public-v1.json`（与兼容地址内容相同）
- 服务能力查询：`GET /api/v1/capabilities`

`/api/v1` 的在线文档只展示公开稳定契约。Legacy、管理端和服务间接口不会出现在公开导航中。
仓库导出的 `openapi-internal-v1.json` 是仅供开发/审查使用的内部快照，不通过 HTTP 路由提供；勿将其发布到第三方开发者页面。旧文件名 `openapi-v1.json` 仅作为 Public JSON 兼容镜像。

仓库内文档：

- [论坛 API V1 参考](./first-party-v1.md)
- [客户端接入指南](./public-client-v1.md)
- [富文本格式 V2](./rich-content-schema-v2.md)
- [认证与凭证](./authentication.md)
- [游戏内容 API V1](./game-content-v1.md)
- [资源中心 API V1](./resources-v1-contract.md)
- [多人联机 API V1](./multiplayer-v1.md)
- [云存档 API V1](./cloud-saves-v1.md)
- [Public V1 错误代码](./errors-v1.md)
- [Public API 更新记录](./changelog-v1.md)
- [Public API 生命周期](./lifecycle-v1.md)
第三方客户端的契约边界以 Public V1 OpenAPI 和本目录的 Public Client 指南为准。仓库中的实现、运维资料和兼容代码不是额外的公开 API 契约。

## V1 响应格式

V1 JSON 接口成功时统一返回 `data` 和 `meta`：

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

### 文件与重定向响应

文件、图片和重定向类接口可能标记为 raw response，不使用上述 JSON envelope，例如：

- Game Content 地图实际文件下载
- 蓝图/地图预览图片
- 资源预览图片
- 文件重定向

调用方应根据 `Content-Type`、HTTP 状态码和响应头处理。

## 认证方式

不同 API 不共用同一种凭证。

| 场景 | 凭证 |
| --- | --- |
| 新客户端 | MindAuth Public Client access token；服务端验证令牌并按 scope 校验 |
| 第三方客户端 | MindAuth Public Client Bearer，Authorization Code + PKCE |
| 机器人或服务端集成 | 获准的服务端凭证；只在可信服务端使用 |

详细流程见 [authentication.md](./authentication.md)。

## 先读取服务能力

客户端启动后应先请求：

```http
GET /api/v1/capabilities
```

能力以嵌套对象表示论坛、资源、通知、私信、游戏内容、联机和客户端状态；`cloud_saves_v1` 表示云存档是否启用。旧版扁平字段（例如 `resource_read`、`resource_files`、`download_grants`、`notifications_v1`）暂时保留为兼容别名。字段说明见[客户端接入指南](./public-client-v1.md)。

能力为 `false` 时，客户端应隐藏或禁用对应功能，不要尝试调用未启用的接口。

`GET /api/v1/client/config?platform=android&version_code=...` 提供移动端最低版本、最新版本、强制更新、维护状态和客户端功能开关。

## 兼容性约定

V1 遵循以下规则：

1. 已文档化字段不会在 V1 内无预告重命名或改变语义。
2. 可以新增可选字段，客户端必须忽略未知字段。
3. 删除字段、改变必填关系、改变身份语义时应进入新版本。
4. HTTP 状态码和 `error.code` 是错误控制流的稳定入口。
5. Capability 可以临时关闭某个功能，功能关闭不代表 endpoint 永久删除。
6. Resource、Game Content 等跨客户端对象优先使用稳定 public id；不要把数据库自增 ID 当成跨系统身份。
7. 文件下载必须校验 hash、可用状态和服务端返回的能力信息。
8. Preview 失败不应让原始资源本身变成不可用。

## 请求限流

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

## OpenAPI 文档维护

`src/openapi/v1-openapi.ts` 是 V1 文档生成入口。

V1 OpenAPI 必须只暴露 `/v1/*` 路径。部分 Nest module 同时包含 legacy controller，因此生成后会执行路径过滤，避免 `/resources`、`/reports`、`/feedback` 等历史路由混入第一方稳定契约。

修改 V1 controller 或 DTO 时：

1. 同步补充 Swagger decorator 和 DTO schema。
2. 检查 `/api/openapi/v1.json` 是否只包含 `/v1/*`。
3. 更新对应 Markdown 文档中的行为说明、限制和示例。
4. 若仓库提交 `openapi-v1.json` 快照，重新导出后再提交。
5. 不要手工把 legacy endpoint 加进 V1 文档来解决客户端需求，应先设计稳定 V1 endpoint。

## 各类接口的边界

以下内容容易混淆，但现在不是同一件事：

- `Resources V1` 提供通用资源读取、Manifest 和持久化上传草稿。
- `Game Content V1` 为蓝图和地图客户端提供搜索、动态、收藏、点赞、上传和下载接口。
- 第三方客户端必须使用自己的 MindAuth Public Client 和 Authorization Code + PKCE S256。第一方兼容登录能力不属于 Public Client 契约。
- 服务器端集成凭证单独受控，不应嵌入客户端；不属于本开发者中心的 Public Client V1。
- `notifications_v1` 已纳入 First-party V1 OpenAPI，默认服务能力为 `true`，并受 `feature_notifications_v1_enabled` 控制；SSE 目前仍为 `false`。
