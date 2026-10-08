# 公开 API 更新记录

本页记录 MDTBBS 面向公开客户端的稳定 V1 API 变更。只记录已进入公开 V1 OpenAPI 契约的行为；论坛内部接口、管理 API、服务间接口和纯实现细节不属于本记录。

每条变更应说明受影响的方法和路径、对客户端的影响、兼容性，以及相关 OAuth scope、请求/响应字段、错误码和限流。破坏性变更还必须给出替代接口和迁移步骤，并链接生命周期公告。接口完整定义以[公开 OpenAPI](/api/openapi/v1.json)为准。

## Public API 1.3.0

- `POST /api/v1/resources/{id}/versions/{versionId}/schematic-editor/export` 和 `map-editor/export` 支持匿名导出已审核公开资源的已发布版本副本；携带 OAuth Bearer 时需要 `resource.read`。私有资源仍校验 Owner/Maintainer，发布新版本仍需 `resource.upload` 和原角色。CSRF、封禁、限流、源文件 SHA-256、官方读写校验继续生效。
- 蓝图 `add_blocks` 增加可选 `copy_from_x`/`copy_from_y`、类型化 `config` 和纯文本 `logic_source`，用于保留复制方块配置；地图对象新增 `rotate`（0–3，出生点不支持）。原字段兼容，非法配置和越界引用返回 400。
- `GET /api/v1/resources/{id}/workbench` 新增可选 `version_public_id`，详情和分析严格匹配所选版本。旧版本缺少结构化索引时可从校验后的源文件读取，不写回数据库。
- 新增 `GET /api/v1/resources/{id}/versions/{versionId}/editor-data` 与 `map-editor/region?x=…&y=…`。前者返回官方编辑元数据和有界方块列表（5 次/分钟），后者读取最多 128×128 的地图分区（20 次/分钟）。公开版本匿名可读；OAuth Bearer 要求 `resource.read`。私有版本保留角色验证；编辑器未就绪返回 503、非法坐标返回 400、不存在的已发布版本返回 404。

## Public API 1.2.0

本次为发现榜单补充可机器读取的算法版本标识，并公布各算法的评分口径。既有路由、筛选、排序和隐私行为不变；新响应字段是兼容性新增，旧客户端可忽略未知字段。算法版本或分数权重改变时会更新算法 ID，并同步文档与 OpenAPI。

### Added

- `GET /api/v1/resources/discovery/home` 的每个 section 新增 `algorithm` 字段：`resource-featured-v1`、`resource-trending-v1`、`resource-rising-v1`、`resource-bayesian-rating-v1`、`resource-newest-v1`。`hot`、`for-you` 和 `related` 继续返回对应算法 ID；OpenAPI 为这些字段声明了枚举值。评分公式、信号窗口、候选上限、reason 和隐私边界见[资源中心 API V1 的资源发现与推荐算法说明](./resources-v1-contract.md)。

## Public API 1.1.0

本次契约修订在初始 `1.0.0` 基础上增加了公开操作和可选查询参数。所有既有公开操作、必填参数和字段语义均保留。OpenAPI `info.version` 使用语义版本；兼容新增提升次版本号，破坏性契约变更需要新的路径主版本和迁移说明。API 基础路径仍是 `/api/v1`。

### Added

- 资源中心新增 Mod、Map、Schematic 的类型化详情、清单、版本、依赖、关系和分析操作；增加协作者管理、审核记录、GitHub Release 来源同步和安全的编辑导出操作。完整接口见[资源中心 API V1](./resources-v1-contract.md)。
- 增加 `POST /api/v1/resources/uploads/init` 与 `POST /api/v1/resources/uploads/complete`。二者要求 `resource.upload`；init 创建短期上传会话，complete 会重新校验对象并建立待审核资源绑定。相关错误包括 `RESOURCE_STORAGE_UNAVAILABLE` (503)、`RESOURCE_STORAGE_OBJECT_NOT_FOUND` (404) 和 `RESOURCE_STORAGE_REJECTED` (422)。
- 游戏内容 API 增加按名称读取和搜索内容的操作，以及地图和资源的类型化读取能力。
- 新增 `GET /api/v1/resources/discovery/home`、`/discovery/hot`、`/discovery/for-you` 和 `/discovery/related/{id}`，公开精选、趋势、近 7 天上升、评分榜、最新、下载榜、猜你喜欢和相关推荐，匿名可读；携带 MindAuth Bearer 时需要 `resource.read`。响应声明稳定 `reasons`、榜单候选窗口分页、公开资源卡片和 V1 request-id envelope。推荐排除删除、未审核、私有和停用主题资源；相关推荐对不可公开源资源统一返回 404。限流分别为 60、60、45、60 次/分钟。匿名推荐不读取个人行为；个性化只用当前公开资源上的站内点赞/收藏。

### Changed

- `GET /api/v1/search` 增加可选 `resource_kind` 与 `content_language` 查询参数，并扩展排序和结果分组值。原有 `post`、`user`、`global` 搜索类型仍保留为兼容输入。`GET /api/v1/search/posts` 保留原有类型值，但该路径始终返回帖子。
- 资源文件下载和预览在使用新文件交付方式时可能返回 HTTP `302`。客户端应跟随重定向；论坛仍负责访问授权，历史文件来源继续兼容。

### Deprecated

- 当前没有已弃用的公开操作。

### Removed

- 当前没有移除公开操作；既有 V1 路径、必填参数和已记录的字段语义均保留。

## Public V1 当前能力摘要

以下内容概览当前 V1 契约，不是逐次 API 修订清单。初始 OpenAPI 契约版本为 `1.0.0`；当前契约版本为 `1.2.0`。论坛应用版本与 API 契约版本相互独立。

#### Added

- **第三方客户端接入与权限：** `GET /api/v1/capabilities`、`GET /api/v1/client/config` 提供能力和客户端配置发现。受保护操作使用 MindAuth access token，并在公开 OpenAPI 中声明所需 OAuth scope；客户端通过 MindAuth 授权码 + PKCE 获得令牌。PKCE 授权端点属于 MindAuth，不是 MindFourm API。新能力和权限声明为增量契约；具体错误与每个操作的限流见 OpenAPI。
- **讨论、回复与消息：** `GET/POST /api/v1/threads`、`GET/PUT/DELETE /api/v1/threads/{id}`、`GET/POST /api/v1/threads/{id}/replies`、`PUT/DELETE /api/v1/threads/{threadId}/replies/{replyId}` 支持 V1 讨论和回复读写；消息包含 `GET /api/v1/messages`、`GET /api/v1/messages/unread-count`、`GET /api/v1/messages/{userId}`、`POST /api/v1/messages`。写操作按 OpenAPI 声明 `forum.write` 或 `message.write`；消息读取使用 `message.read`。标准成功/错误 envelope 保持 `{ data, meta }` / `{ error, meta }`；新增能力不改变旧字段语义。
- **Tiptap 富文本：** 上述讨论/回复写操作及读取模型包含 `content_format: "tiptap_json"`、`content_schema_version`、`content_json`、`content_html` 和 `content_text`。新客户端提交 `content_schema_version: 2` 与 `content_json`；`content_json` 是规范正文，Markdown `content` 作为兼容输入与纯文本投影保留。旧 Markdown-only 写入仍可由服务端转换，客户端无需因新字段移除旧字段。节点、标记及字段约束见[富文本格式 V2](./rich-content-schema-v2.md)。
- **资源中心（Mod、Map、Schematic）：** 通用资源包括 `GET /api/v1/resources`、`GET /api/v1/resources/{id}`、`GET /api/v1/resources/{id}/manifest`、`GET /api/v1/resources/{id}/versions`、`GET /api/v1/resources/{id}/relations`、`GET /api/v1/resources/{id}/stats` 和 `GET /api/v1/resources/{id}/workbench`。版本写入和资料编辑使用 `POST /api/v1/resources/{id}/versions`、`PATCH /api/v1/resources/{id}`。类型化读取包括 `GET /api/v1/resources/mods/{id}/manifest`、`GET /api/v1/resources/maps/{id}/manifest`、`GET /api/v1/resources/schematics/{id}/manifest`，以及对应的版本、依赖/内容/分析端点；完整路径见[资源中心 API V1](./resources-v1-contract.md)。对象以 `public_id` UUID 对外标识；数据库整数 ID 不作为跨客户端身份。
- **资源协作、审核和来源同步：** `POST /api/v1/resources/{id}/members`、`POST /api/v1/resources/{id}/members/respond`、`POST /api/v1/resources/{id}/owner-transfer` 提供成员邀请与所有权转移；`GET /api/v1/resources/{id}/review-events`、`POST /api/v1/resources/{id}/review-annotations`、`POST /api/v1/resources/{id}/versions/analyze` 和 `POST/DELETE /api/v1/resources/{id}/versions/{versionId}/analysis/overrides` 提供审核记录与分析流程；`PUT /api/v1/resources/{id}/source-sync/github`、`GET /api/v1/resources/{id}/source-sync/github/releases`、`POST /api/v1/resources/{id}/source-sync/github/import` 支持 GitHub Release 来源同步。关系、兼容性、依赖、manifest 和文件接口均使用公开 UUID。受保护的资源操作分别按 OpenAPI 声明 `resource.read`、`resource.upload` 或 `resource.download`。新路由为增量能力；Resource V2 的公开读取不会改变既有 V1 资源详情和 Game Content 响应结构。
- **游戏内容：** 蓝图通过 `GET/POST /api/v1/game-content/blueprints` 读取和直接投稿；地图列表使用 `GET /api/v1/game-content/maps`，该 collection 不提供 POST。地图投稿走上传会话：`POST /api/v1/game-content/maps/uploads` 创建会话，`GET /api/v1/game-content/maps/uploads/{uploadId}` 查询状态，`GET /api/v1/game-content/maps/uploads/{uploadId}/preview` 预览，最后由 `POST /api/v1/game-content/maps/uploads/{uploadId}/complete` 完成提交。详情、下载、蓝图代码以及点赞/收藏操作也面向公开客户端。写入按 OpenAPI 要求 `resource.upload` 或 `forum.write`。文件下载可返回原始文件响应；其授权、限流与错误语义以 OpenAPI 和[游戏内容 API V1](./game-content-v1.md)为准。新增操作与已发布资源结构保持兼容。
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
