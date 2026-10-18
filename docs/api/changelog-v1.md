# 公开 API 更新记录

## 2026-10-18 — 资源完成上传的超时处理

- `POST /api/v1/resources/uploads/complete` 的服务端文件回读使用二进制传输超时预算；响应体读取中断或超时返回可重试的 503 `RESOURCE_STORAGE_UNAVAILABLE`，不再泄漏为通用 500。文件大小、SHA-256 校验与审核隔离要求保持不变。

## 2026-10-18 — 资源上传大小上限

- `POST /api/v1/resources/uploads/init` 的 `size_bytes` 上限从 50 MiB 提高到 120 MiB（125829120 字节），原有请求字段、OAuth scope 和响应结构保持兼容。
- 资源文件上传、Mod JAR/ZIP 解析、版本审核和 GitHub Release 资源导入同步使用 120 MiB 上限；Mod 解压大小、条目数及单条目安全限制保持不变。

## 2026-10-17 — OAuth 两档接入

- 仅登录/基本资料令牌访问论坛统一返回 403 `INSUFFICIENT_SCOPE`，包括缓存路径；不创建论坛账号。
- 可信 forum 组展开兼容细分 scope；旧窄范围令牌不自动扩权。
- Presence/Multiplayer 移除 Auth 目录的重复能力审批，保留站点开关、隐私与用户业务权限。
- Public V1 路由、响应包裹与细分 scope OpenAPI 元数据保持兼容。


本页记录 MDTBBS 面向公开客户端的稳定 V1 API 变更。只记录已进入公开 V1 OpenAPI 契约的行为；论坛内部接口、管理 API、服务间接口和纯实现细节不属于本记录。

每条变更应说明受影响的方法和路径、对客户端的影响、兼容性，以及相关 OAuth scope、请求/响应字段、错误码和限流。破坏性变更还必须给出替代接口和迁移步骤，并链接生命周期公告。接口完整定义以[公开 OpenAPI](/api/openapi/v1.json)为准。

## HTML 文档排版扩展

现有 `htmlBlock.attrs.html` 支持完整 HTML 文档及内嵌样式表，长度上限从 20000 扩展到 200000 字符，管理团队权限及每篇最多 5 个区块的约束不变。完整文档的 `content_html` 投影改为隔离 iframe；客户端应保留其 sandbox/CSP，或使用同等隔离的文档容器。旧式无样式表片段的呈现方式保持兼容。Base64 及外站图片须先导入站点存储并替换为站内 URL；完整文档 CSP 仅允许站内图片加载。详细规则见[富文本格式 V2](./rich-content-schema-v2.md)。

## Public API 1.7.0

本次把联机会话的「谁能发现房间」与「谁有资格加入」拆成两个正交的单选设置，契约版本从 `1.6.0` 更新为 `1.7.0`。

此前 `visibility` 同时承担发现与加入判定：`private`、`friends` 会直接拒绝加入，`unlisted` 既是「不出现在列表」又是「凭房间码可加入」，而「符合范围但仍需房主批准」只能塞进 `join_policy = request`。结果是不可见的房间被默认认为不可加入，房间码与邀请被当作权限而不是入口。

新模型中 `visibility` 只回答发现（`private`、`friends`、`public`），`join_policy` 只回答加入资格（`invite_only`、`friends`、`public`），`require_approval` 独立表达「符合范围但需房主批准」。房间码、邀请链接和大厅入口都只是入口，服务端在每条入口上都走同一套加入鉴权。

### Added

- `GET /api/v1/multiplayer/sessions`：公开联机大厅，返回调用者可发现的活跃会话，支持 `page`（从 1 起）与 `limit`（最大 50，默认 20）。只包含 `visibility = public` 的会话、`visibility = friends` 且调用者是房主好友的会话，以及调用者自己已在房内的会话；`private` 会话永不出现。所需 scope 为 `multiplayer.read`。
- `POST /api/v1/multiplayer/sessions` 新增可选请求字段 `require_approval`（布尔，缺省 `false`），并在会话对象中回显。开启后即使符合 `join_policy`，仍需通过加入请求由房主批准。
- `GET /api/v1/multiplayer/capabilities` 新增 `visibility_join_policy_combinations`（九种合法组合的字符串列表）与 `require_approval`（恒为 `true`，表示服务端支持该字段）。

### Changed

- `visibility` 取值由 `private`、`friends`、`unlisted` 改为 `private`、`friends`、`public`；`join_policy` 取值由 `open`、`friends`、`request`、`invite_only` 改为 `invite_only`、`friends`、`public`。两个字段均为单选，任一组合都合法（此前 `private + open` 会被拒绝）。
- `join_code` 的签发条件从 `visibility = unlisted` 改为 `join_policy = public`。房间码只用于定位会话并满足房主自身的 `allow_join` 隐私设置，**不再代表持有加入权限**：`invite_only` 仍要求有效邀请，`friends` 仍要求好友关系。
- `POST /api/v1/multiplayer/sessions/{id}/join-requests` 的适用条件从 `join_policy = request` 改为 `require_approval = true`；`join_policy = invite_only` 不提供加入请求路径。
- 会话对象新增 `require_approval` 字段。客户端应忽略未知的新增字段，因此旧客户端可继续读取 `visibility` 与 `join_policy`（见下方兼容说明）。

### Deprecated

- `visibility = unlisted` 与 `join_policy` 的旧取值 `open`、`request` 不再被接受。服务端在写入路径上已拒绝这些值。

### Security

- 服务端是唯一的加入裁决方，`visibility` 不再参与加入判定。九种组合下均按同一顺序检查：封禁 → 隐私设置 → `join_policy` → 容量 → `require_approval`。
- 大厅列表只做投影：不返回 `code_hash`、中继内部字段或对端级网络数据；被任一方屏蔽的房主不会出现在列表中。

### Notes

- 数据库迁移 `MultiplayerVisibilityJoinPolicySplit1720000380000` 按**有效权限**而非枚举名称重映射历史行：`unlisted` 迁移为 `private` 并保留原 `join_policy`（`unlisted + open` → `private + public`，即旧房间码语义）；`private` 下非邀请的加入一律收敛为 `invite_only`；`join_policy = request` 迁移为 `require_approval = 1`。迁移可回滚。
- 唯一的有意放宽：旧 `unlisted + friends` 会话此前好友也需要房间码，迁移后为 `private + friends`，好友可直接加入。`visibility = private` 仍保证其不出现在任何列表中。
- 客户端 UX 建议收敛为两个单选：「谁能看到这个房间？」（仅自己 / 好友 / 所有人）与「谁能加入？」（仅受邀者 / 我的好友 / 所有人）。不要向普通用户暴露 `code`、`invite`、`friends_direct` 这类入口型复选项。

Ref: #101

## Public API 1.6.0

本次为富文本正文增加块级对齐与受信 HTML 区块，契约版本从 `1.5.0` 更新为 `1.6.0`。既有路由、必填参数和响应字段不变；新增节点与属性均为兼容性新增，不提交它们的旧客户端不受影响。

### Added

- Rich Content Schema v2 的 `paragraph` 和 `heading` 节点新增可选属性 `align`，取值为 `left`、`center`、`right`、`justify` 或 `null`。`left` 与 `null` 等价，均为默认左对齐。此前只有表格单元格支持对齐，正文段落和标题没有对应的表达能力。约束见[富文本格式 V2](./rich-content-schema-v2.md)。
- 讨论、回复、资源说明等所有接受 `content_json` 的写入操作同步接受该属性；`content_html` 渲染为 `data-align` 属性并附带 `text-align` 声明，Markdown 投影和 `content_text` 不受影响。
- 新增块级节点 `htmlBlock`，用于资源介绍、公告一类需要卡片、分栏或图文混排的场景。节点只接受 `attrs.html`（长度上限 20000 字符，每篇内容最多 5 个区块）；`attrs.text` 为服务端派生的纯文本投影，客户端提交的值会被忽略。写入权限限于版主及以上角色。
- `content_html` 为 `htmlBlock` 输出清洗后的片段；Markdown 投影与 `content_text` 使用其纯文本（纯图片区块使用 `img` 的 `alt`），因此搜索、摘要、通知与 RSS 路径不因新增节点而缺失内容。

### Security

- `htmlBlock` 是唯一的受信 HTML 节点，普通成员提交含该节点的正文时返回 `403 HTML_BLOCK_FORBIDDEN`。片段在服务端按标签、属性与 CSS 声明三张白名单清洗后再入库：`script`/`style`/`iframe`/`object`/`template` 及其文本内容、全部事件属性、`url()`、`expression()`、`@import`、`!important`、`position` 与视口单位一律丢弃；`javascript:`、`data:` 与协议相对 URL 被拒绝。清洗幂等，重新生成 `content_html` 不会改写已存内容。
- 读者端不解析原始标记：客户端按同一张白名单把片段转成元素树渲染，全程不使用 `innerHTML`。两端白名单由测试逐项比对，任一侧单独改动会导致测试失败。
- 对齐之外，`content_html` 的样式白名单不因此扩大：普通正文仍然只放行对齐声明。

Ref: #41

## Public API 1.5.0

本次新增面向任意业务的通用 Blob 存储接口 `/api/v1/blobs`，契约版本从 `1.4.1` 更新为 `1.5.0`。既有操作、路由、必填参数和响应字段均未改动，纯新增，旧客户端不受影响。

此前论坛只有三条各自封闭的上传通道：公开图片、资源文件、游戏云存档。每一条都把自己的业务规则（图片格式校验、资源审核、存档 Slot）写死在接口里，新功能要存文件就得再造一张表和一套下载接口。`/api/v1/blobs` 把「存字节」这件事单独抽出来：业务方自己决定 namespace、key、元数据和引用，存储层统一负责内容去重、引用计数、延迟回收和所有者绑定。

### Added

- `GET /api/v1/blobs/quota`：查询当前所有者的已用字节、配额、单对象上限与有效 blob 数量；进行中的上传会预占额度。
- `GET /api/v1/blobs`：列出当前所有者的有效 blob，支持 `namespace`、`ref_type`、`ref_id` 过滤与游标分页。
- `POST /api/v1/blobs`：登记目标 key、文件名、大小、`sha256`、MIME 与可见性，返回上传会话。相同内容已存在时返回 `deduplicated: true` 且无需上传，但**仍需调用 commit**，客户端只需实现一条流程。
- `PUT /api/v1/blobs/uploads/{uploadId}/content`：上传原始字节，必须使用 `application/octet-stream`。服务端边写边校验声明的大小与 SHA-256，不一致即拒绝并丢弃数据。
- `POST /api/v1/blobs/uploads/{uploadId}/commit`：复核存储对象后创建可读写 blob。
- `DELETE /api/v1/blobs/uploads/{uploadId}`：放弃上传会话。
- `GET /api/v1/blobs/{blobId}`：读取 blob 元数据。`public` blob 无需登录；其他账号的 `private` blob 与不存在的 blob 返回相同的 404。
- `GET /api/v1/blobs/{blobId}/content`：下载原始字节，携带 `ETag`（`sha256-<摘要>`）、`Last-Modified` 与 `X-Content-Type-Options: nosniff`。
- `PATCH /api/v1/blobs/{blobId}`：更新 key、文件名、可见性、元数据、标签与业务引用；内容本身不可变。
- `DELETE /api/v1/blobs/{blobId}`：软删除绑定，对象在引用数归零并经过宽限期后被回收。

### Security

- 存储的 MIME 类型来自上传者，无法被内容嗅探证伪，因此只在白名单内（PNG/JPEG/GIF/WebP/AVIF、常见音视频、PDF、纯文本）内联渲染，其余一律以 `application/octet-stream` + `attachment` 返回。这样上传者无法把一个声明为 `text/html` 或 `image/svg+xml` 的文件变成可执行内容。
- 服务端从不信任客户端提交的大小与哈希：落盘后重新读取并校验通过，才写入可读行。
- 对象 key 由服务端生成并严格匹配 `blobs/<namespace>/<owner 摘要>/<uuid>`，路径解析前重新校验，目录穿越与篡改行都读不到存储目录之外。

### Notes

- 内容去重按 `(namespace, owner_type, owner_id, sha256, size)` 唯一，不做全局共享：全局 CAS 会让「删除我自己的文件」与「他人的同一份文件」产生歧义。
- 新增 OAuth scope：`blob.read`、`blob.write`、`blob.delete`。
- 新增错误码前缀 `BLOB_*`（含 `BLOBS_DISABLED`、`BLOB_NOT_FOUND`、`BLOB_KEY_CONFLICT`、`BLOB_QUOTA_EXCEEDED`、`BLOB_FILE_TOO_LARGE`、`BLOB_UPLOAD_*`、`BLOB_STORAGE_UNAVAILABLE`）。
- 功能开关：`blobs_enabled`（默认关闭）。`GET /api/v1/capabilities` 新增 `blobs_v1` 字段，表示功能已开启且存储目录可用。
- 账号删除会连带清理该账号的 blob 绑定与上传会话。

Ref: #38

## Public API 1.4.1

本次将资源发现响应中已提供的 `published_at` 明确纳入公开 OpenAPI 契约，契约版本从 `1.4.0` 更新为 `1.4.1`。既有字段、路由和必填参数不变；新增字段为兼容性新增。

### Added

- `GET /api/v1/resources/discovery/home`、`/discovery/hot`、`/discovery/for-you` 和 `/discovery/related/{id}` 的公开资源卡片将已提供的 `published_at` 纳入 OpenAPI schema：该字段表示资源首次对外可见的时间。此前的 `updated_at` 是通用写入时间戳，浏览和下载计数也会推进它，客户端无法据此得到发布日期；`published_at` 只在资源通过审核时写入一次，后续编辑不改变它。历史资源回填为 `created_at`。
- `GET /api/resources`（论坛内部列表接口）同步新增 `published_at`，并允许以 `published_at` 作为排序键。

### Changed

- `updated_at` 不再被浏览/下载计数推进，仅反映真实的编辑写入。依赖“任何活动都会更新 `updated_at`”的客户端应改用 `published_at`（发布日期）或 `updated_at`（最后编辑时间），二者语义现已分离。

Ref: #14

## Public API 1.4.0

本次修订把云存档上传、冲突、下载和配额在实际运行中的行为写回契约，并补上客户端做分支判断需要的字段。所有既有操作、必填参数和响应字段保持不变；新增字段为兼容性新增，旧客户端可忽略。

### Added

- `POST /api/v1/game-saves/{slotId}/uploads` 在云端已有相同内容摘要时返回 `no_upload_required: true` 并附带一个**已提交**的 `upload_id`。此前该分支只返回 `snapshot_id`，按文档流程“拿到 `upload_id` 就 PUT”的客户端会拿到空值；现在两种响应形状一致，客户端按 `upload_id` 走完整流程即可。该分支一直存在，本次将其文档化并补齐字段。
- 冲突响应的 `details[0]` 新增 `suggested_resolution`：`normal` 策略遇到云端新版本时为 `create_conflict_copy`。上传 PUT 的限流从 20 次/5 分钟调整为 60 次/10 分钟，避免断点续传在会话有效期内被限流。
- `POST /api/v1/game-saves/{slotId}/snapshots/{snapshotId}/download` 新增 `expires_at`（固定为 `null`）和 `reusable: true`，明确该地址不是签名地址、可重复使用；二进制 GET 响应新增 `ETag`（`sha256-<摘要>`）与 `Last-Modified`。

### Fixed

- 文档中云存档列表的 `limit` 默认值从 `20` 更正为 `30`，与实现一致。
- 修正云存档接口中混入的繁体中文文案。
- 提交阶段配额校验失败时会把上传会话置为 `failed`，暂存文件随维护任务回收，不再留下永远无法提交的悬空会话。

Ref: #12

## Public API 1.3.0

- `POST /api/v1/resources/{id}/versions/{versionId}/schematic-editor/export` 和 `map-editor/export` 支持匿名导出已审核公开资源的已发布版本副本；携带 OAuth Bearer 时需要 `resource.read`。私有资源仍校验 Owner/Maintainer，发布新版本仍需 `resource.upload` 和原角色。CSRF、封禁、限流、源文件 SHA-256、官方读写校验继续生效。
- 蓝图 `add_blocks` 增加可选 `copy_from_x`/`copy_from_y`、类型化 `config` 和纯文本 `logic_source`，用于保留复制方块配置；地图对象新增 `rotate`（0–3，出生点不支持）。原字段兼容，非法配置和越界引用返回 400。
- `GET /api/v1/resources/{id}/workbench` 新增可选 `version_public_id`，详情和分析严格匹配所选版本。旧版本缺少结构化索引时可从校验后的源文件读取，不写回数据库。
- 新增 `GET /api/v1/resources/{id}/versions/{versionId}/editor-data` 与 `map-editor/region?x=…&y=…`。前者返回官方编辑元数据和有界方块列表（5 次/分钟），后者读取最多 128×128 的地图分区（20 次/分钟）。公开版本匿名可读；OAuth Bearer 要求 `resource.read`。私有版本保留角色验证；编辑器未就绪返回 503、非法坐标返回 400、不存在的已发布版本返回 404。
- `GET /api/v1/resources/{id}/versions/{versionId}/editor-data` 的限流从 5 次提高到 60 次/分钟；权限、响应和错误语义不变。

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

以下内容概览当前 V1 契约，不是逐次 API 修订清单。初始 OpenAPI 契约版本为 `1.0.0`；当前契约版本见本文档最新一节（`src/openapi/api-version.ts` 的 `API_V1_VERSION` 是唯一来源）。论坛应用版本与 API 契约版本相互独立。

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
