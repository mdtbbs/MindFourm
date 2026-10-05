# 公开 API 更新记录

本页记录 MDTBBS 面向公开客户端的稳定 V1 API 变更。只记录已进入公开 V1 OpenAPI 契约的行为；论坛内部接口、管理 API、服务间接口和纯实现细节不属于本记录。

每条变更应说明受影响的方法和路径、对客户端的影响、兼容性，以及相关 OAuth scope、请求/响应字段、错误码和限流。破坏性变更还必须给出替代接口和迁移步骤，并链接生命周期公告。接口完整定义以[公开 OpenAPI](/api/openapi/v1.json)为准。

## 尚未发布

### Added

- 暂无。

### Changed

- 暂无。

### Deprecated

- 暂无。

### Removed

- 暂无。

### Fixed

- 暂无。

### Security

- 暂无。

## 已发布版本

### Public V1 — OpenAPI `info.version` `1.0.0`

仓库将 Public V1 契约标记为 `1.0.0`。Git 历史可以确认以下功能已合入当前 `master`，但没有记录一个统一的 V1 对外发布日期；此处不推定发布日期，也不把论坛应用版本号当作 API 版本。

#### Added

- **第三方客户端接入与权限：** `GET /api/v1/capabilities`、`GET /api/v1/client/config` 提供能力和客户端配置发现。受保护操作使用 MindAuth access token，并在公开 OpenAPI 中声明所需 OAuth scope；客户端通过 MindAuth 授权码 + PKCE 获得令牌。PKCE 授权端点属于 MindAuth，不是 MindFourm API。新能力和权限声明为增量契约；具体错误与每个操作的限流见 OpenAPI。
- **讨论、回复与消息：** `GET/POST /api/v1/threads`、`GET/PUT/DELETE /api/v1/threads/{id}`、`GET/POST /api/v1/threads/{id}/replies`、`PUT/DELETE /api/v1/threads/{threadId}/replies/{replyId}` 支持 V1 讨论和回复读写；消息包含 `GET /api/v1/messages`、`GET /api/v1/messages/unread-count`、`GET /api/v1/messages/{userId}`、`POST /api/v1/messages`。写操作按 OpenAPI 声明 `forum.write` 或 `message.write`；消息读取使用 `message.read`。标准成功/错误 envelope 保持 `{ data, meta }` / `{ error, meta }`；新增能力不改变旧字段语义。
- **Tiptap 富文本：** 上述讨论/回复写操作及读取模型包含 `content_format: "tiptap_json"`、`content_schema_version`、`content_json`、`content_html` 和 `content_text`。新客户端提交 `content_schema_version: 2` 与 `content_json`；`content_json` 是规范正文，Markdown `content` 作为兼容输入与纯文本投影保留。旧 Markdown-only 写入仍可由服务端转换，客户端无需因新字段移除旧字段。节点、标记及字段约束见[富文本格式 V2](./rich-content-schema-v2.md)。
- **资源中心（Mod、Map、Schematic）：** 通用资源包括 `GET /api/v1/resources`、`GET /api/v1/resources/{id}`、`GET /api/v1/resources/{id}/manifest`、`GET /api/v1/resources/{id}/versions`、`GET /api/v1/resources/{id}/relations`、`GET /api/v1/resources/{id}/stats` 和 `GET /api/v1/resources/{id}/workbench`。版本写入和资料编辑使用 `POST /api/v1/resources/{id}/versions`、`PATCH /api/v1/resources/{id}`。类型化读取包括 `GET /api/v1/resources/mods/{id}/manifest`、`GET /api/v1/resources/maps/{id}/manifest`、`GET /api/v1/resources/schematics/{id}/manifest`，以及对应的版本、依赖/内容/分析端点；完整路径见[资源中心 API V1](./resources-v1-contract.md)。对象以 `public_id` UUID 对外标识；数据库整数 ID 不作为跨客户端身份。
- **资源协作、审核和来源同步：** `POST /api/v1/resources/{id}/members`、`POST /api/v1/resources/{id}/members/respond`、`POST /api/v1/resources/{id}/owner-transfer` 提供成员邀请与所有权转移；`GET /api/v1/resources/{id}/review-events`、`POST /api/v1/resources/{id}/review-annotations`、`POST /api/v1/resources/{id}/versions/analyze` 和 `POST/DELETE /api/v1/resources/{id}/versions/{versionId}/analysis/overrides` 提供审核记录与分析流程；`PUT /api/v1/resources/{id}/source-sync/github`、`GET /api/v1/resources/{id}/source-sync/github/releases`、`POST /api/v1/resources/{id}/source-sync/github/import` 支持 GitHub Release 来源同步。关系、兼容性、依赖、manifest 和文件接口均使用公开 UUID。受保护的资源操作分别按 OpenAPI 声明 `resource.read`、`resource.upload` 或 `resource.download`。新路由为增量能力；Resource V2 的公开读取不会改变既有 V1 资源详情和 Game Content 响应结构。
- **游戏内容：** `GET/POST /api/v1/game-content/blueprints`、`GET /api/v1/game-content/maps`、`GET /api/v1/game-content/blueprints/{id}`、`GET /api/v1/game-content/maps/{id}`、`GET /api/v1/game-content/maps/{id}/download`、`GET /api/v1/game-content/blueprints/{id}/code`、地图上传会话以及点赞/收藏操作支持蓝图和地图客户端。写入按 OpenAPI 要求 `resource.upload` 或 `forum.write`。文件下载可返回原始文件响应；其授权、限流与错误语义以 OpenAPI 和[游戏内容 API V1](./game-content-v1.md)为准。新增操作与已发布资源结构保持兼容。
- **云存档：** `/api/v1/game-saves`、`/api/v1/game-saves/{slotId}`、快照、上传会话、文件上传、提交、下载、恢复、固定与删除操作提供用户云存档。读取、写入、删除分别使用 `game_content.saves.read`、`game_content.saves.write`、`game_content.saves.delete`。这是新增能力；字段、限额、冲突和错误处理见[云存档 API V1](./cloud-saves-v1.md)。
- **多人联机、邀请与在线状态：** `/api/v1/multiplayer/...` 提供会话、加入请求、候选地址、邀请和 relay 操作；邀请使用 `GET/POST /api/v1/multiplayer/invites` 和 `POST /api/v1/multiplayer/invites/{id}/accept|decline|revoke`。Presence 使用 `GET/PATCH /api/v1/social/privacy`、`POST /api/v1/presence/connections`、`PATCH/DELETE /api/v1/presence/connections/{id}`、心跳和 activity 子路径；`POST /api/v1/realtime/tickets` 为实时通道签发短期 ticket。scope 包括 `multiplayer.read/write`、`presence.read/write` 和 `friends.read`。状态转换、TTL 和响应字段以[多人联机 API V1](./multiplayer-v1.md)及 OpenAPI 为准。相关端点为新增能力；客户端应根据服务能力处理功能关闭或暂不可用。
- **公开 V1 错误代码与资源包：** `/api/v1/docs/errors` 提供稳定错误代码说明；`GET /api/v1/packs/{packId}/versions/{versionId}/manifest`、`POST .../download-grants`、`GET/PUT /api/v1/resources/{packId}/versions/{versionId}/pack-items` 支持已发布资源包的固定成员清单和批量下载授权。资源包读取/下载操作使用 `resource.read` / `resource.download`；所有者成员管理使用 `resource.upload`。

#### Changed

- 公开契约由显式 Public V1 OpenAPI 操作清单界定。在线参考和 `GET /api/openapi/v1.json` 只呈现公开操作；内部快照 `openapi-internal-v1.json` 不属于客户端契约。`openapi-v1.json` 与 `openapi-public-v1.json` 是公开契约快照及兼容镜像。客户端应忽略新增可选响应字段，并以 OpenAPI 的 operation scope、错误响应和 rate-limit 元数据为准。
- Resource Center V2 在既有 Resource aggregate 上增加不可覆盖的版本/revision、成员、关系、审核和结构化分析数据；发布同一显示版本会产生新 revision，不覆盖旧文件。已存在的资源详情、manifest 和 Game Content 字段语义继续兼容。

#### Deprecated

- 当前公开 V1 OpenAPI 未标记弃用操作。弃用前必须先在[生命周期页面](/api/v1/docs/lifecycle)公布版本、替代接口、移除计划和迁移指南。

#### Removed

- 当前公开 V1 OpenAPI 没有记录已移除操作。

#### Fixed

- 收紧公开 OpenAPI 导出边界，使兼容控制器或内部 V1 路由不会仅因路径前缀而进入第三方契约。此前依赖未列入 OpenAPI 的内部路由不构成公开 API 支持承诺。

#### Security

- 对公开客户端操作声明并执行 OAuth scope；匿名读取操作即使携带 Bearer token，也按 OpenAPI 为该操作声明的可选 scope 校验。资源成员、审核、上传、来源同步和下载授权按角色、对象所有权与对应 scope 限制。客户端不得将服务端集成凭证嵌入应用。
