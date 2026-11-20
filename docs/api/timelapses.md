# 基地延时摄影与战报卡 V1

基地延时摄影把 Mindustry 基地的逐帧缩略图与统计指标打包成 `.mreplay.zip`，由渲染 Worker 合成 H.264 MP4 视频、WebP 封面和图表摘要。作者可以把战报嵌入帖子正文的 `battleReport` 节点，读者在帖子内直接播放并查看电力、产能与兵力曲线。

战报需要经过渲染和审核。未通过审核或不可见的战报对非作者统一返回 404，不泄露视频流。

## 能力开关与权限

客户端应先读取 `GET /api/v1/capabilities`：

- `timelapses_v1` 为 `true` 表示功能已开启且存储目录可用；为 `false` 时不要展示上传入口。
- 新数据库默认 `timelapses_enabled = true`（灰度，前置条件是已部署渲染 Worker）；运营可在后台关闭。关闭后，创建上传、上传文件、提交渲染和创建草稿帖返回 `403 TIMELAPSE_DISABLED`。
- `timelapse_auto_approve_trusted` 默认 `false`，即所有成片先进入 `pending_review`。
- 审核默认走人工流程；站点开关 `timelapse_auto_approve_trusted` 打开时，版主/管理员或达到信任门槛且未被封禁的作者可以在渲染完成后直接发布，跳过 `pending_review`。

OAuth 权限范围：

| 权限范围 | 用途 |
| --- | --- |
| `timelapse.read` | 读取已发布或本人可见的战报、视频与封面 |
| `timelapse.write` | 创建上传会话、上传帧包、提交渲染与生成草稿帖 |

`GET /api/v1/timelapses/{id}`、`GET /api/v1/timelapses/{id}/video`、`GET /api/v1/timelapses/{id}/poster` 支持匿名读取已发布战报；请求携带 Bearer 时必须持有 `timelapse.read`。写接口需要 `timelapse.write` 或等效的站内登录会话。

## API 路径

下表中的 JSON 接口返回 V1 信封 `{ "data": ..., "meta": { "request_id": ... } }`；视频与封面是原始二进制响应。路径均为完整路径。

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| POST | `/api/v1/timelapses/uploads` | `timelapse.write` | 创建上传会话并校验限额 |
| PUT | `/api/v1/timelapses/uploads/{id}/file` | `timelapse.write` | 上传 `.mreplay.zip` 原始字节 |
| POST | `/api/v1/timelapses/{id}/commit` | `timelapse.write` | 校验并提交渲染 |
| GET | `/api/v1/timelapses/{id}` | 匿名 / `timelapse.read` | 查询状态、元数据、图表与播放地址 |
| GET | `/api/v1/timelapses/{id}/video` | 匿名 / `timelapse.read` | 播放 H.264 MP4（支持 Range） |
| GET | `/api/v1/timelapses/{id}/poster` | 匿名 / `timelapse.read` | 读取 WebP 封面 |
| POST | `/api/v1/timelapses/{id}/draft-post` | `timelapse.write` | 生成含 `battleReport` 节点的帖子草稿 |

本版本没有公开的战报列表、删除或可见性修改接口。客户端通过已知的 `id`（例如帖子中 `battleReport` 节点的 `timelapsePublicId`）读取战报。

上传、提交和草稿帖接口只接受战报作者本人；其他账号调用返回 `404 TIMELAPSE_NOT_FOUND`。

控制器级限流（超限返回 `429 RATE_LIMITED`，并带 `Retry-After`）：

| 接口 | 限制 |
| --- | --- |
| `POST /api/v1/timelapses/uploads`、`POST /api/v1/timelapses/{id}/commit`、`POST /api/v1/timelapses/{id}/draft-post` | 10 次 / 60 秒 |
| `PUT /api/v1/timelapses/uploads/{id}/file` | 10 次 / 600 秒 |
| `GET /api/v1/timelapses/{id}` | 120 次 / 60 秒 |
| `GET /api/v1/timelapses/{id}/video` | 600 次 / 60 秒 |
| `GET /api/v1/timelapses/{id}/poster` | 300 次 / 60 秒 |

上述限流与账号级的创建限额（`TIMELAPSE_RATE_LIMITED`）相互独立。

## 上传与渲染流程

### 1. 创建上传会话

```http
POST /api/v1/timelapses/uploads
Authorization: Bearer <access-token>
```

无请求体。成功响应：

```json
{
  "data": {
    "id": "0f5c2e2a-6d28-4f0e-9a5d-1b2c3d4e5f60",
    "upload_url": "/api/v1/timelapses/uploads/0f5c2e2a-6d28-4f0e-9a5d-1b2c3d4e5f60/file",
    "expires_at": "2026-12-20T10:00:00.000Z",
    "max_bytes": 26214400
  },
  "meta": { "request_id": "req_..." }
}
```

- `id` 是战报公开 ID（UUID），后续所有请求使用它。
- `upload_url` 是相对当前 API origin 的上传路径，必须使用同一 Bearer 令牌。
- `expires_at` 是未绑定帖子的战报保留截止时间（创建后 30 天）。
- 上传会话必须在创建后 **24 小时**内完成上传并提交；超时后 `PUT` 返回 `410 TIMELAPSE_UPLOAD_EXPIRED`，已被维护任务回收的会话返回 404。
- 创建成功即占用 1 个“处理中”名额，直到离开 `uploading` / `queued` / `processing`（进入审核、失败或会话被清理）。

### 2. 上传原始帧包

```http
PUT /api/v1/timelapses/uploads/{id}/file
Authorization: Bearer <access-token>
Content-Type: application/octet-stream

<原始 .mreplay.zip 字节>
```

请求体必须是未编码的 ZIP 字节。服务端边写边计算 SHA-256 与字节数，超过 25 MiB 时返回 `413 TIMELAPSE_FILE_TOO_LARGE`。成功响应：

```json
{
  "data": {
    "id": "0f5c2e2a-6d28-4f0e-9a5d-1b2c3d4e5f60",
    "uploaded": true,
    "size_bytes": 5242880,
    "sha256": "<64 位小写十六进制>",
    "max_bytes": 26214400
  },
  "meta": { "request_id": "req_..." }
}
```

在 `uploading` 状态下可以重复 PUT 覆盖上一次未提交的文件。已提交渲染后再上传返回 `409 TIMELAPSE_ALREADY_COMMITTED`。

### 3. 提交渲染

```http
POST /api/v1/timelapses/{id}/commit
Authorization: Bearer <access-token>
Content-Type: application/json

{ "sha256": "<可选，客户端计算的 64 位小写十六进制>" }
```

服务端校验：

- 已存在完整上传文件；否则返回 `409 TIMELAPSE_UPLOAD_INCOMPLETE`。
- 可选的 `sha256` 与服务端计算结果一致；不一致返回 `409 TIMELAPSE_CHECKSUM_MISMATCH`。
- 文件以 ZIP 本地文件头开始；不是 ZIP 返回 `400 TIMELAPSE_INVALID_ARCHIVE`。

成功后状态变为 `queued`，响应 `{ "id": "...", "status": "queued" }`。对已排队、渲染中、待审核或已发布的战报重复 commit 是幂等的，返回当前状态和 `idempotent: true`。渲染队列不可用时返回 `503 TIMELAPSE_QUEUE_UNAVAILABLE`，状态回退为 `uploading`，可以稍后重试。

### 4. 轮询状态

客户端轮询 `GET /api/v1/timelapses/{id}`，直到 `status` 变为 `published`、`rejected` 或 `failed`。服务端不提供 webhook。

## `.mreplay.zip` 包结构

ZIP 根目录包含：

| 路径 | 说明 |
| --- | --- |
| `manifest.json` | 战报元数据：`schema_version: 1`、`client`、`game_version`、`map_name`、`map_width`、`map_height`、`game_mode`、`is_multiplayer`、`mods[]`、`started_at`、`ended_at`、`frame_count`、`frames_digest_sha256`。 |
| `metrics.jsonl` | 逐帧统计，每行一个 JSON 对象（帧序号、游戏时间、波次、电力、核心库存、产能、单位与建筑数量等）。每行 ≤ 4 KiB，不得包含聊天、IP、玩家名或 UUID。 |
| `frames/0000.png`、`frames/0001.png` …… | 按顺序编号的缩略地图帧，PNG 格式。 |

约束：

- ZIP 总大小 ≤ **25 MiB**（26,214,400 字节）。
- 解压后总大小 ≤ **80 MiB**。
- 帧数 **5–180**。
- 单帧尺寸 ≤ **1024×1024**。
- `metrics.jsonl` 单行 ≤ **4 KiB**。

`commit` 只检查 ZIP 基础头；完整的解压安全检查（路径、条目数量、PNG 魔数与尺寸）和合成由渲染 Worker 在隔离沙箱中完成。不合规的包会让战报进入 `failed`，失败原因通过 `failure_code` / `failure_reason` 返回给作者。

## 状态机

```text
uploading ──commit──> queued ──worker 开始──> processing ──渲染完成──> pending_review ──审核通过──> published
                                                                                   └──审核驳回──> rejected
queued / processing ──渲染失败、超时或队列丢失──> failed
processing ──自动通过（可信作者）──> published
```

| 状态 | 含义 |
| --- | --- |
| `uploading` | 已创建上传会话，尚未提交渲染 |
| `queued` | 已入 Redis 渲染队列，等待 Worker |
| `processing` | Worker 正在校验并合成视频 |
| `pending_review` | 成片已生成，等待人工审核 |
| `published` | 已发布，所有人可读 |
| `rejected` | 审核驳回，仅作者可读，`review_reason` 说明原因 |
| `failed` | 渲染失败，仅作者可读，`failure_code` / `failure_reason` 说明原因 |

`published`、`rejected`、`failed` 为终态。`pending_review` 只在 `timelapse_auto_approve_trusted` 未放行时出现。

## 限额与保留

| 项目 | 限制 |
| --- | --- |
| 未绑定任何已发布帖子的战报 | 每账号 ≤ 20 个 |
| 创建上传会话 | 每账号每小时 ≤ 3 次、每日 ≤ 10 次 |
| 同时处理中的战报 | 每账号 ≤ 1 个（`uploading` / `queued` / `processing`） |
| 上传会话有效期 | 创建后 24 小时 |
| 未绑定帖子的战报保留 | 30 天，到期软删除并清理视频、封面与原始包 |
| 原始 `.mreplay.zip` 保留 | 合成完成（成功或失败）后 24 小时 |
| 被已发布帖子引用的战报 | 随帖子永久保留；所有引用帖子删除后重新获得 30 天宽限 |

未绑定战报包括上传中、排队中或渲染中的会话，已生成但尚未被帖子引用的成片，以及被驳回或失败的战报。超额时 `POST /api/v1/timelapses/uploads` 返回：

- `429 TIMELAPSE_DRAFT_LIMIT_EXCEEDED`：未绑定战报达到 20 个。
- `429 TIMELAPSE_CONCURRENT_LIMIT`：已有 1 个处理中的战报。
- `429 TIMELAPSE_RATE_LIMITED`：超过每小时或每日创建限额。

## 可见性与播放

- `published` 且 `visibility != private` 的战报对所有人可见，包括未登录请求。
- 其他状态只有作者本人可读；其他请求返回 `404 TIMELAPSE_NOT_FOUND`，与“不存在”不可区分。
- 新建战报的 `visibility` 当前固定为 `public`；本版本没有修改可见性的接口。
- `video_url` / `poster_url` 仅在成片存在且当前查看者有权读取时非空；处理中、失败或未审核对他人的响应为 `null`。
- `GET /api/v1/timelapses/{id}/video` 返回 `video/mp4`，支持单段 `Range` 请求：范围有效时返回 `206` 与 `Content-Range`，格式错误或越界返回 `416` 与 `Content-Range: bytes */{size}`。响应带 `Accept-Ranges: bytes`、`ETag`、`Last-Modified` 与 `Cache-Control: private`。
- `GET /api/v1/timelapses/{id}/poster` 返回 `image/webp`，`Cache-Control: private, max-age=300`。
- 视频和封面标记为私有缓存，不应由共享缓存保存。

## `GET /api/v1/timelapses/{id}` 响应字段

`data` 字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 战报公开 ID（UUID） |
| `status` | string | 状态机取值 |
| `visibility` | string | `private` / `unlisted` / `public`；新建战报固定为 `public` |
| `author` | object | `{ id, username, avatar_url }` |
| `map_name` | string | 地图名；处理完成前为空字符串 |
| `map_width` / `map_height` | number \| null | 地图尺寸 |
| `game_mode` | string \| null | 游戏模式 |
| `game_version` | string \| null | 游戏版本 |
| `is_multiplayer` | boolean | 是否多人游戏 |
| `max_wave` | number | 最高波次；未统计时为 0 |
| `duration_seconds` | number | 战斗时长（秒），用于图表时间轴与波次跳转；处理完成前为 0 |
| `frame_count` | number | 帧数（5–180）；处理完成前为 0 |
| `video_url` | string \| null | 相对 API 路径，指向 `GET /api/v1/timelapses/{id}/video` |
| `poster_url` | string \| null | 相对 API 路径，指向 `GET /api/v1/timelapses/{id}/poster` |
| `metrics` | array | 图表点，最多 120 个；每点见下表 |
| `highlights` | object | 亮点摘要，见下表 |
| `created_at` | string | ISO 8601 创建时间 |
| `published_at` | string \| null | 发布时间；未发布为 `null` |
| `review_reason` | string \| null | 审核说明；自动通过时为 `auto_approved_trusted`。仅作者/管理员可见 |
| `failure_code` | string \| null | 渲染失败码；仅作者/管理员可见 |
| `failure_reason` | string \| null | 渲染失败说明；仅作者/管理员可见 |

`metrics[]`：

| 字段 | 说明 |
| --- | --- |
| `t` | 帧序号（0 起） |
| `elapsed_sec` | 游戏内经过秒数 |
| `wave` | 波次 |
| `power_gen` / `power_use` / `power_stored` | 发电、用电、储能 |
| `core_items` | 核心库存 |
| `item_rate_per_min` | 每分钟产能 |
| `units_ally` / `units_enemy` | 我方/敌方单位数 |
| `buildings_ally` | 我方建筑数 |
| `players_online` | 在线玩家数 |

`highlights`：

| 字段 | 说明 |
| --- | --- |
| `peak_power_gen` / `peak_power_use` / `peak_power_stored` | 峰值电力 |
| `peak_item_rate_per_min` | 峰值产能 |
| `max_wave` | 最高波次 |
| `peak_buildings_ally` | 建筑峰值 |
| `peak_units_ally` / `peak_units_enemy` | 单位峰值 |

## 生成草稿帖

```http
POST /api/v1/timelapses/{id}/draft-post
Authorization: Bearer <access-token>
Content-Type: application/json

{ "title": "可选，最多 200 字", "category_id": 1 }
```

- 仅作者可调用；非作者或战报不存在返回 `404 TIMELAPSE_NOT_FOUND`。战报必须处于 `published` 或 `pending_review`，否则返回 `409 TIMELAPSE_NOT_READY`。
- `title` 省略时使用 `基地延时战报：{map_name}`；`category_id` 省略时使用站点默认分类（未配置时不指定分类）。
- 成功返回 `{ "post_id": 123, "title": "...", "status": "draft" }`，正文是包含 `battleReport` 节点的 Schema v2 草稿，作者编辑后发布。
- 创建草稿帖仍受账号写权限、手机号/邮箱验证和分类有效性约束；作者后续发布草稿时还遵循论坛的审核策略。

## 在帖子正文中使用 `battleReport`

```json
{
  "type": "battleReport",
  "attrs": { "timelapsePublicId": "0f5c2e2a-6d28-4f0e-9a5d-1b2c3d4e5f60" }
}
```

- 仅 Rich Content Schema v2 支持；块级原子节点，不包含 `content`。
- 每篇正文最多 3 个，超限返回 `400 BATTLE_REPORT_LIMIT_EXCEEDED`。
- 允许的父节点：`doc`、表格单元格（`tableCell` / `tableHeader`）、列表项（`listItem` / `taskItem`）与 `spoiler`；不能放在引用块 `blockquote` 内。
- `attrs.timelapsePublicId` 必填，必须是 `GET /api/v1/timelapses/{id}` 返回的 `id`。
- `attrs.mapName` / `attrs.maxWave` 是服务端派生字段：写入帖子时按数据库战报覆盖，客户端提交值不会保存。
- 新建帖子引用不存在或已删除的战报返回 `400 TIMELAPSE_NOT_FOUND`；引用他人未审核或不可见的战报返回 `403 TIMELAPSE_NOT_AVAILABLE`。编辑旧帖时已失效的引用保留占位，不阻塞保存。
- HTML 投影输出 `<figure data-battle-report="1" data-timelapse-public-id="{id}">` 与指向站内详情页 `/timelapses/{id}` 的摘要链接；纯文本与 Markdown 投影只包含 `[基地延时战报: {mapName} · 最高 {maxWave} 波]`。投影不包含视频或封面地址。
- 非作者读取未审核战报时，卡片显示不可用占位；正文投影只暴露公开 ID 与摘要，不会泄露视频流。

完整节点规则见 `docs/api/rich-content-schema-v2.md`。

## 站内管理接口

以下接口供论坛版主/管理员使用，需要具备 `moderator` 或 `admin` 角色的论坛登录身份；它们不属于 Public V1 OpenAPI，也不使用 `timelapse.read` / `timelapse.write` OAuth scope。成功响应沿用站内包裹 `{ "success": true, "data": ... }`；错误响应不使用 V1 的 `{ error, meta }` 信封，通常为 `{ "success": false, "code": "...", "message": "..." }`（参数校验错误可能不含 `code`）。

本节路径中的 `{id}` 均为战报公开 UUID，与 Public V1 `GET /api/v1/timelapses/{id}` 的 `id` 相同，不是数据库自增 ID。

### `GET /api/admin/timelapses`

查询参数：

| 参数 | 说明 |
| --- | --- |
| `status` | 可选，按状态筛选 |
| `page` | 页码，默认 1 |
| `limit` | 每页数量，默认 20，最大 100 |

按创建时间倒序返回，成功响应形状：

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "0f5c2e2a-6d28-4f0e-9a5d-1b2c3d4e5f60",
        "status": "pending_review",
        "visibility": "public",
        "map_name": "示例地图",
        "max_wave": 120,
        "frame_count": 90,
        "duration_seconds": 3600,
        "failure_code": null,
        "failure_reason": null,
        "created_at": "2026-11-20T10:00:00.000Z",
        "reviewed_at": null,
        "review_reason": null,
        "author": { "id": 7, "username": "作者" }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

### `POST /api/admin/timelapses/{id}/review`

```json
{ "decision": "approve", "reason": "可选，最多 500 字" }
```

- `decision` 为 `approve` 或 `reject`；`reject` 时必须提供 `reason`，否则返回 `400 TIMELAPSE_REVIEW_REASON_REQUIRED`。
- 只有 `pending_review` 状态可以审核；其他状态返回 `409 TIMELAPSE_NOT_REVIEWABLE`。
- 成功响应的 `data` 包含 `id`、`status`（`published` / `rejected`）、`reviewed_at`、`review_reason`；审核动作写入审计日志并通知作者。

## 错误码

JSON 错误响应使用 V1 的 `{ error, meta }` 信封，客户端应读取 `error.code` 与 HTTP 状态码。

| 错误码 | HTTP | 可重试 | 场景 |
| --- | --- | --- | --- |
| `TIMELAPSE_DISABLED` | 403 | 否 | 写接口在 `timelapses_enabled` 关闭时返回 |
| `TIMELAPSE_NOT_FOUND` | 404 / 400 | 否 | 查询或播放不可见；帖子引用不存在时为 400 |
| `TIMELAPSE_NOT_AVAILABLE` | 403 | 否 | 帖子引用他人未审核或不可见的战报 |
| `TIMELAPSE_RATE_LIMITED` | 429 | 是 | 每小时或每日创建次数超限 |
| `TIMELAPSE_CONCURRENT_LIMIT` | 429 | 是 | 已有 1 个处理中的战报 |
| `TIMELAPSE_DRAFT_LIMIT_EXCEEDED` | 429 | 否 | 未绑定帖子的战报达到 20 个 |
| `TIMELAPSE_FILE_TOO_LARGE` | 413 | 否 | 原始帧包超过 25 MiB |
| `TIMELAPSE_INVALID_ARCHIVE` | 400 | 否 | 文件不是 ZIP 或缺少合法本地文件头 |
| `TIMELAPSE_UPLOAD_INCOMPLETE` | 409 | 否 | 尚未上传或文件未完整写入 |
| `TIMELAPSE_CHECKSUM_MISMATCH` | 409 | 否 | 提交的 `sha256` 与服务端结果不一致 |
| `TIMELAPSE_UPLOAD_EXPIRED` | 410 | 否 | 上传会话超过 24 小时 |
| `TIMELAPSE_ALREADY_COMMITTED` | 409 | 否 | 已提交渲染后再次上传文件 |
| `TIMELAPSE_UPLOAD_NOT_OPEN` | 409 | 否 | 战报已进入其他终态，不再接受上传 |
| `TIMELAPSE_NOT_COMMITTABLE` | 409 | 否 | 当前状态不能提交渲染 |
| `TIMELAPSE_NOT_READY` | 409 | 否 | 战报尚未生成，不能创建草稿帖 |
| `TIMELAPSE_NOT_REVIEWABLE` | 409 | 否 | 战报不在 `pending_review`，不能审核 |
| `TIMELAPSE_REVIEW_REASON_REQUIRED` | 400 | 否 | 驳回时未提供审核说明 |
| `TIMELAPSE_QUEUE_UNAVAILABLE` | 503 | 是 | Redis 渲染队列不可用 |
| `TIMELAPSE_WORKER_NOT_CONFIGURED` | 503 | 是 | 渲染 Worker 密钥未配置 |
| `TIMELAPSE_STORAGE_UNAVAILABLE` | 503 | 是 | 延时摄影存储未配置或不可用 |
| `TIMELAPSE_DRAFT_UNAVAILABLE` | 503 | 是 | 帖子服务暂时不可用 |
| `TIMELAPSE_DRAFT_FAILED` | 500 | 是 | 草稿创建失败 |
| `TIMELAPSE_AUTHOR_NOT_FOUND` | 404 | 否 | 当前账号不存在 |

`failure_code` 可能包含渲染侧错误（例如 `WORKER_TIMEOUT`、`WORKER_QUEUE_LOST`、`WORKER_ARTIFACTS_MISSING`），它们是战报数据的一部分，不是本次请求的错误码。

## 相关文档

- 富文本节点与投影：`docs/api/rich-content-schema-v2.md`
- 能力查询：`GET /api/v1/capabilities`
- 更新记录：`docs/api/changelog-v1.md`
