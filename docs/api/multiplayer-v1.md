# 多人联机 API V1

## 接入流程

论坛负责账号、好友和联机控制信令，包括在线状态、会话、网络候选地址交换与官方 Relay 凭证分配。客户端负责 STUN/NAT 探测、P2P 建连和 Mindustry 协议接入。游戏数据在客户端之间传输；P2P 不通时经过官方 Relay Agent。论坛 API 服务不转发或保存游戏数据包。

1. 在 MindAuth 注册 Public Client，使用 Authorization Code + PKCE S256。只申请产品实际需要的 scope；启动器集成另需提交启动 URI 模板并申请对应客户端能力。
2. 请求 `GET /api/v1/capabilities`，确认 `multiplayer` 下需要的功能开关已启用。第三方客户端还需要获批 `third_party_multiplayer_v1` 能力。
3. 客户端登录后调用 `POST /api/v1/presence/connections` 创建在线连接。请求中的 `platform` 表示客户端类型；服务端返回连接 ID 和心跳间隔。
4. 调用 `PUT /api/v1/presence/connections/{connection_id}/activity` 发布游戏状态。应用名称和图标由已审核的 OAuth 客户端资料提供，客户端无需重复提交。
5. 调用 `POST /api/v1/multiplayer/sessions` 创建会话，再按服务端返回的策略加入、邀请或请求加入。连接建立后，双方分别提交网络候选地址。
6. 如需实时事件，申请一次性 WebSocket ticket 后连接 `/realtime/v1`。断线重连时发送各事件流的 `last_event_id`；若收到 `resume_failed`，重新获取快照。

公共 JSON 接口位于 `/api/v1/*`，成功响应使用 `{data, meta}`，错误通过稳定的 `error.code` 标识。论坛 Cookie 和移动端会话继续按第一方规则处理；MindAuth Bearer 按请求所需的 scope 校验。第三方联机功能还受站点开关和应用能力审核控制。

## 接口一览

| 方法 | 路径 | Scope | 用途 |
|---|---|---|---|
| GET/PATCH | `/api/v1/social/privacy` | `presence.read` / `presence.write` | 读写 Presence、Activity 和联机权限 |
| GET | `/api/v1/social/friends/presence?page=1&limit=50` | `friends.read presence.read` | 第一方聚合好友、Presence、Activity、客户端资料、隐私和动作；最多 50 人/页 |
| GET/POST | `/api/v1/friends`、`/api/v1/friends/requests` | `friends.read` | 好友和好友请求 |
| GET | `/api/v1/friends/requests` | `friends.read` | 待处理请求 |
| POST | `/api/v1/friends/requests/{id}/accept`、`.../{id}/reject` | `friends.read` | 接受/拒绝好友请求 |
| DELETE | `/api/v1/friends/{userId}` | `friends.read` | 删除好友 |
| GET/POST/DELETE | `/api/v1/blocks`、`/api/v1/users/{id}/block` | `friends.read` | 查询、屏蔽和解除屏蔽 |
| POST | `/api/v1/presence/connections` | `presence.write` | 创建 Presence Connection |
| PATCH/DELETE | `/api/v1/presence/connections/{id}` | `presence.write` | 更新状态和删除 Presence Connection |
| POST | `/api/v1/presence/connections/{id}/heartbeat` | `presence.write` | Presence 心跳 |
| PUT/DELETE | `/api/v1/presence/connections/{id}/activity` | `presence.write` | 发布或清除 Rich Activity |
| GET/PATCH | `/api/v1/multiplayer/preferences` | `multiplayer.read` / `multiplayer.write` | 读取/设置用户默认 Join Intent 客户端 |
| GET | `/api/v1/multiplayer/capabilities` | `multiplayer.read` | Multiplayer 能力与约束 |
| POST | `/api/v1/multiplayer/sessions` | `multiplayer.write` | 创建 Session；可选 visibility、join_policy、max_players |
| GET | `/api/v1/multiplayer/sessions/{id}`、`.../{id}/peers` | `multiplayer.read` | 查询可见 Session 和 Peer |
| POST | `/api/v1/multiplayer/sessions/resolve-code` | `multiplayer.read` | 解析 Unlisted Session 加入码 |
| POST | `/api/v1/multiplayer/sessions/{id}/join`、`.../{id}/leave` | `multiplayer.write` | 加入/退出或用绑定的 resume token 恢复 Peer |
| POST | `/api/v1/multiplayer/sessions/{id}/peers/{peerId}/heartbeat` | `multiplayer.write` | Peer 心跳 |
| POST | `/api/v1/multiplayer/sessions/{id}/candidates` | `multiplayer.write` | 发布 Candidate |
| GET | `/api/v1/multiplayer/sessions/{id}/peers/{peerId}/candidates` | `multiplayer.read` | 读取 Peer Candidate |
| DELETE | `/api/v1/multiplayer/sessions/{id}/candidates/{candidateId}` | `multiplayer.write` | 删除 Candidate |
| POST | `/api/v1/multiplayer/invites` | `multiplayer.write` | 创建邀请 |
| GET | `/api/v1/multiplayer/invites` | `multiplayer.read` | 列出自己的邀请 |
| POST | `/api/v1/multiplayer/invites/{id}/accept`、`.../decline`、`.../revoke` | `multiplayer.write` | 处理邀请；接受返回 Join Intent |
| POST | `/api/v1/multiplayer/sessions/{id}/join-requests` | `multiplayer.write` | 请求加入 `join_policy=request` 的 Session |
| POST | `/api/v1/multiplayer/join-requests/{id}/approve`、`.../reject` | `multiplayer.write` | 房主批准/拒绝；批准返回 10 分钟有效、绑定申请者 OAuth 客户端的 Join Intent |
| POST | `/api/v1/multiplayer/sessions/{id}/join-intents` | `multiplayer.write` | 创建 60 秒、绑定用户的 Join Intent；不预绑定 OAuth client；可传 Unlisted `join_code` |
| POST | `/api/v1/multiplayer/join-intents/{id}/consume` | `multiplayer.write` | Launcher 消费 Intent 并成为 Session Peer；直接、邀请接受和审批 Intent 的同用户/首次消费客户端可在 10 分钟恢复相同 Peer 与 Resume Token |
| POST | `/api/v1/multiplayer/sessions/{id}/relay` | `multiplayer.write` | 为当前 Peer 请求官方 Relay Credential |
| POST | `/api/v1/realtime/tickets` | `friends.read` | 创建 60 秒一次性 WebSocket ticket |

Session visibility 为 `private`、`friends`、`unlisted`；join policy 为 `open`、`friends`、`request`、`invite_only`。V1 没有公共大厅或 Host Migration。房主主动离开后 Session 进入既有的 60 秒 closing grace，只有同用户、同 OAuth 客户端并带有效一次性 resume token 才能恢复；房主心跳超时后，90 秒 presence lease 到期时 Session 进入 closing。Peer 另有独立的 60 秒恢复窗口；它与 Session closing grace 是两种状态期限，即使当前时长相同也分别判定。

好友 Presence 返回的 `actions.can_join`、`can_request_join`、`can_invite` 是后端策略结果。客户端不得自行推导按钮权限。Block 优先于 Privacy；好友聚合最多批量查询一页，不做每好友一组 SQL。

## 请求参数与响应

下面的 JSON 展示 `data` 的业务内容；公共 V1 成功响应外层还包含 `meta.request_id`。所有 ID（例如 `connection_id`、`session_id`、`peer_id`、`invite_id`、`intent_id`）均是不透明字符串，只能原样传回。除好友用户 ID 外，不要自行解析 ID，也不要提交 `user_id`、`client_id`、Peer role 等由 token 或服务端确定的字段。

### 隐私设置与好友

`GET /api/v1/social/privacy` 返回当前账号设置。`PATCH` 只更新请求中提供的字段，不提交的项保持原值：

| 字段 | 类型 | 可选值 / 含义 |
|---|---|---|
| `presence_visibility` | string | `everyone`、`friends`、`nobody`；谁能看到在线状态。 |
| `activity_visibility` | string | 同上；谁能看到 Rich Activity。 |
| `allow_join` | string | 同上；谁能通过普通加入流程加入你的 Session。 |
| `allow_join_request` | string | 同上；谁能向你发送加入请求。 |
| `allow_invites` | string | 同上；谁能向你发送联机邀请。 |
| `show_last_seen` | boolean | 是否向可查看状态的人展示上次在线时间。 |
| `status` | string | GET 响应中的当前状态：`online`、`idle`、`dnd`、`invisible`。它不是隐私 PATCH 字段；通过创建/更新 Presence Connection 设置。 |

```http
PATCH /api/v1/social/privacy
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{"presence_visibility":"friends","activity_visibility":"friends","allow_join":"friends","show_last_seen":true}
```

发送好友请求的 JSON 是 `{"target_user_id":123}`；`target_user_id` 是要添加的论坛用户整数 ID。反向请求可能被服务端直接合并为已接受关系。`GET /api/v1/friends`、`GET /api/v1/friends/requests` 与 `GET /api/v1/blocks` 返回当前账号可见记录数组；好友请求的 `{id}` 是请求 ID，`/friends/{userId}` 和 `/users/{id}/block` 中的整数参数则是目标用户 ID。创建、接受、拒绝、删除、屏蔽与解除屏蔽都以服务端策略结果为准。

### 在线状态与活动信息

创建连接：

```http
POST /api/v1/presence/connections
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{"platform":"launcher","status":"online"}
```

| 请求字段 | 必填 | 类型 / 约束 | 含义 |
|---|---|---|---|
| `platform` | 是 | `web`、`launcher`、`lanlink`、`mindustry_mod`、`android` | 当前连接的客户端类型。 |
| `status` | 否 | `online`、`idle`、`dnd`、`invisible` | 更新用户状态；省略时保留现有状态。 |

响应为 `{"connection_id":"prs_…","heartbeat_interval":30,"expires_in":90}`。每个客户端实例应单独创建连接，并每 30 秒调用 `POST /api/v1/presence/connections/{id}/heartbeat`；90 秒没有心跳时连接过期。`PATCH /api/v1/presence/connections/{id}` 可只提交 `{"status":"idle"}`；DELETE 会结束该连接。心跳返回 `acknowledged`、`heartbeat_interval`、`expires_in`；删除返回 `removed`。

Rich Activity 由当前连接提交到 `PUT /api/v1/presence/connections/{id}/activity`：

```json
{
  "type": "playing",
  "name": "正在游玩 Salt Flats",
  "details": "Wave 216",
  "state": "生存模式",
  "game": {"id":"mindustry","version":"v157"},
  "party": {"current":2,"max":8},
  "timestamps": {"started_at":1790841600},
  "join": {"session_id":"ses_AbCdEf0123456789_-wxyz"}
}
```

| 字段 | 必填 | 类型 / 限制 | 含义 |
|---|---|---|---|
| `type` | 是 | `playing`、`hosting`、`editing`、`browsing`、`downloading`、`uploading`、`launcher`、`custom` | Activity 类型。 |
| `name` | 是 | 非空字符串，最多 160 字符 | Activity 主标题。 |
| `details` / `state` | 否 | 字符串，各最多 300 字符 | 次级文字与状态说明。 |
| `game.id` | 有 `game` 时必填 | 字符串，最多 128 字符 | 游戏稳定标识。`game.version` 可选，最多 64 字符。 |
| `party.current` / `party.max` | 否 | 0–10000 整数 | 当前人数与队伍上限。 |
| `timestamps.started_at` | 否 | 非负 Unix 秒 | Activity 开始时间。 |
| `join.session_id` | 否 | 当前用户活跃 Peer 所属 Session ID | 允许好友查看时提供可加入 Session；服务端会检查归属。 |

Activity 的 `client_id`、`platform`、`updated_at` 由已认证连接补齐。第三方应用的名称、图标、开发者信息来自 MindAuth 审核后的应用资料，不能在 Activity body 中伪造。`DELETE .../{id}/activity` 清除 Activity，响应为 `{"removed":true}`。

### 好友在线聚合

```http
GET /api/v1/social/friends/presence?page=1&limit=50
Authorization: Bearer <ACCESS_TOKEN>
```

| 查询参数 | 默认 | 限制 / 含义 |
|---|---:|---|
| `page` | 1 | 从 1 开始的页码。 |
| `limit` | 50 | 每页好友数，范围 1–50。 |

响应外层 envelope 的 `data.data` 是每位好友一项的数组，`data.pagination` 保留分页摘要；标准翻页字段同时位于 `meta.pagination`，其中 `total_pages` 与 `has_more` 由 API 规范化生成。客户端优先读取 `meta.pagination`：

```json
{
  "data": {
    "data": [{"user":{"id":456},"presence":{"status":"online"},"activity":null,"actions":{"can_join":false,"can_request_join":false,"can_invite":false,"session_visible":false}}],
    "pagination": {"page":1,"limit":50,"total":73,"totalPages":2}
  },
  "meta": {
    "request_id":"req_example",
    "pagination":{"page":1,"limit":50,"total":73,"total_pages":2,"has_more":true}
  }
}
```

每项字段如下：

| 字段 | 含义 |
|---|---|
| `user` | 好友公开资料；隐私策略不允许展示的资料不会借此接口泄漏。 |
| `presence.status` | `online`、`idle`、`dnd` 或 `offline`。隐藏或不可见状态按隐私策略显示为离线。 |
| `presence.last_seen_at` | 可选 Unix 秒时间戳；只在设置允许且当前离线时出现。 |
| `activity` | Rich Activity 或 `null`。其中 `client` 是审核目录里的客户端公开资料；无权查看的活动或 Join Session 信息会被剔除。 |
| `actions.can_join` | 当前查看者能否直接加入该好友展示的 Session。 |
| `actions.can_request_join` | 当前查看者能否请求加入该 Session。 |
| `actions.can_invite` / `invite_session_id` | 当前查看者能否邀请该好友进入自己所在的 Session，以及可用于邀请的 Session ID。 |
| `actions.session_visible` | 当前查看者能否看到关联 Session。 |

上面 `actions` 全部由服务器按 Block、隐私、Session 策略与名额计算，客户端应直接使用这些结果。

## 联机会话参数与示例

### 能力、客户端偏好与 Session

`GET /api/v1/multiplayer/capabilities` 返回可用功能和服务端枚举，例如：

```json
{
  "sessions_v1": true,
  "invites_v1": true,
  "relay_v1": true,
  "third_party_multiplayer": true,
  "visibility": ["private","friends","unlisted"],
  "join_policies": ["open","friends","request","invite_only"],
  "transports": ["udp","tcp","quic","custom"],
  "relay_credential_ttl_seconds": 120
}
```

四个布尔值表示 Session、邀请、Relay 和第三方应用功能当前是否启用；先检查它们及顶层 `multiplayer` capability，再展示功能。`GET /api/v1/multiplayer/preferences` 返回 `default_client_id` 与 `clients`。PATCH body 可提交 `{"client_id":"desktop-launcher"}`；`client_id` 必须来自返回的 `clients`。发送 `null` 或省略表示清除默认启动器。客户端对象包含 `client_id`、`name`、`application_icon_url`、`developer_name`、`developer_url`、`supports_presence`、`supports_multiplayer`、`supports_join_intent`、`launch_uri_template`。

创建 Session：

```http
POST /api/v1/multiplayer/sessions
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "game_id":"mindustry",
  "game_version":"v157",
  "activity_name":"正在游玩 Salt Flats",
  "visibility":"friends",
  "join_policy":"friends",
  "max_players":8
}
```

| 请求字段 | 必填 | 类型 / 取值 | 默认或含义 |
|---|---|---|---|
| `game_id` | 是 | 非空字符串，最多 128 字符 | 游戏稳定标识。 |
| `game_version` | 否 | 最多 64 字符 | 客户端/服务器游戏版本。 |
| `activity_name` | 否 | 最多 160 字符 | 好友看到的 Session 活动文字；缺省使用 `game_id`。 |
| `visibility` | 否 | `private`、`friends`、`unlisted` | 缺省 `private`。Unlisted 会在创建结果中返回一次性展示的 `join_code`。 |
| `join_policy` | 否 | `open`、`friends`、`request`、`invite_only` | 缺省 `friends`；`private + open` 不允许。 |
| `max_players` | 否 | 2–64 整数 | 缺省 8。 |

创建响应包含 `session`、`peer`、`resume_token`，Unlisted Session 还包含 `join_code`。立即安全保存 `resume_token`；它绑定用户和 OAuth `client_id`、只能使用一次，断线恢复后会旋转出新 token。

```json
{
  "session": {
    "id":"ses_AbCdEf0123456789_-wxyz",
    "owner_user_id":123,
    "visibility":"friends",
    "join_policy":"friends",
    "game":{"id":"mindustry","version":"v157"},
    "activity_name":"正在游玩 Salt Flats",
    "current_players":1,
    "max_players":8,
    "status":"active",
    "expires_at":"2026-10-01T16:00:00.000Z"
  },
  "peer": {
    "peer_id":"peer_AbCdEf0123456789_-wxyz",
    "user_id":123,
    "client_id":"desktop-launcher",
    "role":"owner",
    "status":"active",
    "capabilities":null,
    "joined_at":"2026-10-01T12:00:00.000Z",
    "last_seen_at":"2026-10-01T12:00:00.000Z"
  },
  "resume_token":"<STORE_SECURELY>"
}
```

Session 对象中的 `current_players` 是当前占用人数：`joining`、`active` 和仍在恢复窗口内的 `disconnected` Peer 都占用名额；`expired` Peer 不占名额。Peer 心跳每 30 秒发送一次；90 秒未收到心跳后状态变为 `disconnected`，服务端清理其网络候选和 Relay Allocation，并保留 60 秒恢复窗口。此窗口按最后一次心跳的 presence lease 截止时间计算；窗口结束后 Peer 变为 `expired`，resume token 不再可用，名额释放。`expires_at` 是 Session 最长生命周期截止时间。Peer 对象的 `role` 为 `owner` 或 `member`，`status` 是 `joining`、`active`、`disconnected`、`expired` 等服务端状态；`capabilities` 是客户端加入时提交的可选 JSON。`GET .../sessions/{id}/peers` 返回仍占用名额的 Peer 数组；该接口要求调用者本身是活跃 Peer。

### 解析、加入、退出和恢复

Unlisted 加入码用 `POST /api/v1/multiplayer/sessions/resolve-code` 解析，body 为 `{"code":"A1B2C3D4E5"}`（10 位十六进制码）。加入码只应作为短期邀请信息分享。公开或好友策略允许的直接加入可用：

```http
POST /api/v1/multiplayer/sessions/ses_AbCdEf0123456789_-wxyz/join
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{"capabilities":{"transport":["udp","tcp"],"game_version":"v157"}}
```

| Body 字段 | 是否必填 | 含义 |
|---|---|---|
| `invite_id` | 否 | 通过邀请加入时使用目标用户收到的有效邀请 ID。 |
| `join_code` | 否 | 加入 Unlisted Session 时提交对应加入码。 |
| `resume_token` | 否 | 恢复既有 Peer 时提交；若提供则优先执行恢复。成功后旧 token 作废并返回新 token。 |
| `capabilities` | 否 | 客户端可选能力 JSON；服务端作为该 Peer 信息返回，不会据此授予权限。 |

新加入返回 `{ "peer": ..., "resume_token": "..." }`。即使 join body 没有可选字段，也发送 `{}`；恢复时还会有 `resumed: true`。恢复只能在 Peer 的 60 秒恢复窗口内完成；过期 Peer 不可恢复。`POST .../sessions/{id}/leave` 不需要 body；普通成员返回 `{ "status":"left" }`，房主主动退出返回 `{ "status":"closing","grace_seconds":60 }`。调用 `POST .../sessions/{id}/peers/{peerId}/heartbeat` 续期活跃 Peer，响应含 `peer_id`、30 秒 `heartbeat_interval` 和 90 秒 `expires_in`。

若加入策略要求审批，客户端先 `POST .../sessions/{id}/join-requests`（无 body），房主通过 approve/reject 路径处理；请求有效期为 5 分钟。申请请求应使用最终消费该 Intent 的 OAuth 客户端。批准后，申请者收到绑定该 OAuth 客户端的 10 分钟 Join Intent。启动器消费意图时调用 `POST /api/v1/multiplayer/join-intents/{intentId}/consume`，至少发送空 JSON 对象 `{}`，也可传 `{"capabilities":{...}}`。批准事件和状态在 MySQL 中与审批状态同事务保存；Realtime 会在 Redis 或进程恢复后重发，直至客户端处理完成并 ACK。相同用户、OAuth 客户端和 intent 的重复消费在 Peer 首次创建后的 10 分钟恢复期内返回相同 Peer 与 Resume Token，不会创建第二个 Peer；Resume Token 本身不以明文存储。批准意图使用稳定的服务端密钥派生，生产环境需保留配置中的 `MULTIPLAYER_RELAY_CREDENTIAL_SECRET` 或 `MINDAUTH_NATIVE_EXCHANGE_SECRET`。客户端下载批准事件后应先成功消费并保存本地游标，再发送 ACK。应用若提供启动器选择，应从 `preferences.clients` 选出应用；客户端注册的启动 URI 模板必须包含 `{intent_id}`，用户确认后才唤起启动器。

需要为 Unlisted Session 创建直接 Join Intent 时，调用 `POST /api/v1/multiplayer/sessions/{id}/join-intents`，发送 `{}`；也可传 `{"join_code":"A1B2C3D4E5"}` 证明持有该 Session 的加入码。成功返回 `{"intent_id":"jnt_opaque","expires_in":60}`。Intent 在 MySQL 中以 SHA-256 哈希保存，创建时绑定论坛用户，但保留“任意已注册 Launcher OAuth client 均可首次消费”的现有语义。首个成功消费的 OAuth client 会在同一数据库事务中绑定到结果；首次消费必须在 60 秒内完成。

直接创建和接受邀请产生的 Intent，在首次消费创建 Peer 后 10 分钟内，同一论坛用户和首次消费的 OAuth client 重放同一 `intent_id`，会恢复相同 Peer 与 Resume Token，不会创建第二个 Peer。结果、Peer 与 Resume Token 哈希在同一事务提交；恢复期间 Peer 清理任务不会将该 Peer 标记为过期。接受邀请时，`invite.status=accepted` 与唯一 Join Intent 在同一事务写入；重复调用 accept 会返回该邀请当前有效的同一 Intent。尚未消费的 Intent 超过 60 秒后，重试会在行锁保护下轮换原 Intent 的哈希与有效期；已经消费的 Intent 永不重新授权，重试仍指向原消费结果。升级前已接受的邀请会在第一次重试时安全补建 durable Intent。不同 client 在首次消费后重放会得到 `JOIN_INTENT_CLIENT_MISMATCH`。生产部署必须在所有实例配置同一稳定的 `MULTIPLAYER_RELAY_CREDENTIAL_SECRET` 或 `MINDAUTH_NATIVE_EXCHANGE_SECRET`，且在仍有未过期 Join Intent 或结果恢复窗口时不要轮换密钥；缺少可用密钥时服务端会在签发 Intent 或消费事务开始前失败关闭。部署还需先应用 `MultiplayerJoinIntentRecovery1720000180000` migration。

已批准的 Join Request Intent 仍绑定申请时提供的 OAuth client，保留上文所述可恢复 10 分钟及 Realtime ACK 规则。直接和邀请 Intent 则在首次成功消费时绑定 client。

升级到持久化 Join Request 后，迁移会将 `status='approved'` 且 `join_intent_hash`、`join_intent_expires_at` 均为空的旧记录置为 `expired`。这些旧记录的随机 Redis bearer 和 OAuth client 绑定无法安全复原，申请者需要重新提交 Join Request 并等待房主批准；该兼容处理不影响独立直接 Join Intent 的 Redis 消费。

### 网络候选地址交换

每个活跃 Peer 用自己的 token 发布 Candidate；地址只在同 Session 内 Peer 之间短期交换。请求示例：

```http
POST /api/v1/multiplayer/sessions/ses_AbCdEf0123456789_-wxyz/candidates
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "candidate": {
    "kind":"public",
    "transport":"udp",
    "address":"203.0.113.10",
    "port":6567,
    "priority":100,
    "metadata":{"source":"stun"}
  }
}
```

| `candidate` 字段 | 必填 | 限制 / 含义 |
|---|---|---|
| `kind` | 是 | `local`、`public`、`relay`。 |
| `transport` | 是 | `udp`、`tcp`、`quic`、`custom`。 |
| `address` | 是 | IP 或符合限定字符集的主机地址，最多 255 字符。 |
| `port` | 是 | 1–65535。 |
| `priority` | 否 | 0–65535，默认 0。 |
| `metadata` | 否 | 任意 JSON 对象，序列化后不超过 1 KiB。不要放 token 或敏感信息。 |

发布返回 `candidate_id` 与 90 秒 `expires_in`。对同一 Peer 重复发布相同的 `kind`、`transport`、`address`、`port` 会续期并复用原 `candidate_id`，适合客户端定期刷新候选而不堆积重复记录。通过 `GET .../sessions/{id}/peers/{peerId}/candidates` 读取的是 Candidate 数组，每项含 `candidate_id`、`peer_id`、上述网络字段及 `created_at`（Unix 毫秒）。每 Peer 最多 32 条；用 `DELETE .../candidates/{candidateId}` 删除本人发布的候选。

### 邀请与 Relay 中继

创建邀请的 body 为 `{"session_id":"ses_AbCdEf0123456789_-wxyz","target_user_id":456}`。`session_id` 必须属于当前活跃 Peer，`target_user_id` 是论坛用户整数 ID；邀请 5 分钟过期。目标用户 GET `/api/v1/multiplayer/invites` 收到的是数组，元素含 `invite_id`、`session_id`、`sender_user_id`、`target_user_id`、`status`、`expires_at` 和会话摘要 `session`。接受邀请返回 `join_intent`；拒绝/撤销不需要 body，返回更新后的 `status`。

公共 Relay 分配 `POST /api/v1/multiplayer/sessions/{id}/relay` 不需要 body，返回如下结构：

```json
{
  "allocation_id":"rly_AbCdEf0123456789_-wxyz",
  "agent_id":"official-eu-1",
  "endpoint":"wss://relay.example.invalid:443/relay/v1",
  "credential":"<SHORT_LIVED_CREDENTIAL>",
  "expires_in":120
}
```

`credential` 是短期秘密，只允许放入 WSS 第一条 AUTH 文本帧，不可放在 URL、query、日志或分析事件里。Credential 的消费和 HTTPS Agent 协议见下文 Relay 专节。

### WebSocket 票据

公共 Realtime WebSocket 不能直接拿 OAuth access token 放进 URL。先用 `friends.read` scope 调用 `POST /api/v1/realtime/tickets`（无 body）：

```json
{"ticket":"<ONE_TIME_TICKET>","expires_in":60,"websocket_path":"/realtime/v1"}
```

将返回的短期 ticket 作为 `/realtime/v1?ticket=...` 的一次性连接凭证；连接成功后立即失效，60 秒内未使用也会过期。不要记录 ticket 或把它分享给其他用户。WebSocket 事件流和断线续传格式见下一节。

## WebSocket 实时事件

地址为当前 API 主机上的 `/realtime/v1`，生产建议由独立 `realtime.mdtbbs.cn` 入口转发到 Realtime Gateway。WebSocket 首帧 `hello` 含心跳间隔。客户端发送：

```json
{"type":"heartbeat"}
{"type":"subscribe","sessions":["ses_AbCdEf0123456789_-wxyz"]}
{"type":"ack","stream":"user","id":"1790758200000-0"}
{"type":"resume","last_event_id":"1790758200000-0","sessions":{"ses_AbCdEf0123456789_-wxyz":"1790758200000-1"}}
```

服务端支持 `hello`、`heartbeat_ack`、`subscribed`、`event`、`ack`、`error`、`resumed` 和 `resume_failed`。Event 含 `id`、`event`、`timestamp`、`data`；user stream 用 `events:user:{userId}`，session stream 用 `events:session:{sessionId}`。每个 Redis Stream 最多保留 600 秒；恢复最多补发 200 条事件，cursor 已过期或 Redis 不可用时通知客户端重取 Snapshot。Peer 状态以数据库为准；客户端在 WebSocket 重连后应重新读取 Session/Peer Snapshot 来收敛状态，不能只依赖 `peer.disconnected` 或 `peer.updated` 实时事件。读取 peers 前须确保自身是活跃 Peer；断线客户端应先用 resume token 恢复自己。

事件名：`friend.request.created`、`friend.request.accepted`、`friend.removed`、`presence.updated`、`activity.updated`、`multiplayer.invite.created`、`multiplayer.invite.accepted`、`multiplayer.invite.revoked`、`multiplayer.join_request.created`、`multiplayer.join_request.approved`、`multiplayer.join_request.rejected`、`session.updated`、`session.closed`、`peer.joined`、`peer.updated`、`peer.disconnected`、`peer.left`、`candidate.created`、`candidate.removed`、`relay.allocated`、`relay.revoked`。

`multiplayer.join_request.approved` 发给申请者的原 OAuth 客户端，`data` 包含 `join_request_id`、`session_id` 和可直接传给启动器的 `intent_id`。批准记录同时作为持久 outbox；Redis append 失败、Realtime 进程重启或客户端未 ACK 时，服务端会从该记录重发。`intent_id` 在批准后 10 分钟失效；同一用户/客户端在结果恢复窗口内重试消费会得到同一 Peer 和 Resume Token。客户端只有在消费成功后才 ACK；崩溃后收到新事件 ID 时可重复消费并恢复结果。其它普通 Realtime 事件仍使用 Redis Stream 的 600 秒保留与 Snapshot 收敛规则。`intent_id` 是在保留现有事件字段基础上的新增字段，旧客户端可忽略它。

## 服务端状态与存储

TypeORM migration `MultiplayerPlatformV11720000150000` 持久化无向好友唯一键、Social Privacy、Presence 用户偏好、Session、Peer、Resume Token、Invite、Join Request、Relay Allocation 和最小化 Audit；migration `MultiplayerJoinApprovalDurability1720000170000` 在 Join Request 行保存批准意图摘要、Peer 恢复结果及 Realtime ACK/重发状态；migration `MultiplayerJoinIntentRecovery1720000180000` 持久化直接/邀请 Join Intent 哈希及首个消费结果。`synchronize=false` 保持关闭。普通 Presence、Activity、Candidate、Realtime stream、Relay Agent health 放 Redis；直接/邀请 Intent 的初次有效期为 60 秒，成功消费的结果在 MySQL 保留 10 分钟恢复；批准 Join Intent 为 600 秒；ticket 为 60 秒；Candidate TTL 为 90 秒；Relay Agent heartbeat 为 45 秒；Relay Credential/Allocation 为 120 秒；事件 Stream 为 600 秒。LanLink 旧客户端的 Presence 兼容投影单独存于 `presence:lanlink:{userId}`，TTL 为 120 秒；V1 Session Presence 通过心跳续期旧 External API 投影，两个来源不会互相删除。

旧版 LanLink Mod 仍使用本地 LanLink bearer、LLK1/LLKU 数据传输和 16 字节 room token；服务端要求它升级后才能使用 V1 联机。新版客户端使用 MindAuth Authorization Code + PKCE、V1 Session/Peer/Candidate 控制面和独立 WSS Relay AUTH 数据通道。Forum 好友页可按用户隐私显示兼容 Presence，但不会把旧房间转换成 V1 Session、Join Intent 或 Relay Allocation。

键模式：

```text
presence:conn:{connectionId}                 # 90s
presence:user:{userId}:connections            # 索引 hash，活动时 180s
activity:conn:{connectionId}                  # 90s
events:user:{userId}                          # stream，600s
events:session:{sessionId}                    # stream，600s
realtime:ticket:{ticket}                      # 一次性票据，60s
multiplayer:session:{sessionId}               # session 快速状态
multiplayer:peer:{peerId}                     # peer 快速状态，90s
multiplayer:candidates:{sessionId}:{peerId}   # candidate hash，90s
multiplayer:join-intent:{intentId}             # 旧进程存量 intent 兼容读取，最多60s
multiplayer:relay:agent:{agentId}               # agent 心跳，45s
multiplayer:relay:session-lock:{sessionId}      # 同一 Session 固定到一个 Agent 的锁，30s
multiplayer:relay:peer-lock:{peerId}            # 每 Peer 最多一个活动 allocation 的锁，30s
ratelimit:{category}:{subject}                 # 由共享限流 Guard 按窗口设置
```

## 功能开关与配置

以下是 Settings 中的 bool key，默认全部关闭：

```text
feature_social_presence_v1_enabled
feature_rich_activity_v1_enabled
feature_multiplayer_sessions_v1_enabled
feature_multiplayer_invites_v1_enabled
feature_multiplayer_relay_v1_enabled
feature_third_party_multiplayer_v1_enabled
```

公开环境变量：

| 变量 | 说明 |
|---|---|
| `MINDAUTH_URL` | MindAuth public application metadata API 的 base URL |
| `MULTIPLAYER_RELAY_CREDENTIAL_SECRET` | 至少 32 字符的 Credential HMAC secret；Forum 与官方 Relay Agent 通过独立安全配置共享 |
| `MULTIPLAYER_RELAY_MACHINE_CREDENTIAL` | 至少 32 字符的 Relay 内部机器凭证 |
| `MULTIPLAYER_RELAY_AGENT_IDS` | 允许注册的官方 Agent ID，逗号分隔；不支持第三方 Provider |
Relay Agent 内部请求复用 Forum 的 HTTPS 入口，调用 `/api/internal/v1/relay/agents/*`，并携带 `X-Relay-Machine-Credential`。Forum 用配置的机器凭证做 timing-safe 校验，再检查 Agent ID allowlist 和 allocation/session/peer 绑定。Relay feature flag 开启时，Forum 启动前检查至少 32 字符的两个共享密钥和非空 Agent allowlist；不需要独立端口或 Agent 客户端证书。外部 WSS 数据面仍使用有效的公开 TLS 证书。Multiplayer V1 的 WSS Agent `endpoint` 必须是带显式端口的 `wss://host:port/relay/v1`；其他传输类型可使用 `udp://host:port`、`quic://host:port` 或 `tcp://host:port`，但不属于本版客户端数据通道。Control Plane 签发仅含 allocation/session/peer/agent/expiry 的短期签名凭证，不含账号资料或 OAuth token。

`POST /api/v1/multiplayer/sessions/{id}/relay` 返回 `allocation_id`、`agent_id`、`endpoint`、短期 `credential` 和 `expires_in`。Credential 当前是 `base64url(JSON payload).base64url(HMAC-SHA256)`；payload 恰有 `relay_session_id`（等于 allocation ID）、`session_id`、`peer_id`、`agent_id`、`expiry`（Unix 秒）五个字段。客户端只应在内存短期持有 Credential，并且只能在 WSS 建连后通过首个文本帧发送，例如 `{"op":"auth","version":1,"credential":"<credential>"}`；同一 WSS 连接重新认证使用 `{"op":"reauth","version":1,"credential":"<renewed credential>"}`。禁止放入 URL、query、子协议名或日志。

同一 Session 的所有仍有效 Allocation 固定到同一个健康 Agent，直到它们全部过期或撤销。每个 Peer 最多有一个仍有效 Allocation。如果遗留数据中同一 Session 已有多个 Agent 的活动 Allocation，Control Plane 会 fail closed 并返回 `RELAY_UNAVAILABLE`，待冲突 Allocation 过期或撤销后再分配。Agent 为每条新 WSS 连接生成随机 `connection_id`；首次 `auth` 和同一 WSS 上的 `reauth` 都复用这个 ID。Peer 已连上时再次调用公共 `/relay` 会返回相同 `allocation_id` 和新 Credential；新 expiry 先记为待确认值，当前 lease 到 Agent 在同一连接上成功消费 Credential 后才延长。Agent 收到任一认证帧后，通过 HTTPS 调用对应的内部 `POST /api/internal/v1/relay/agents/{agentId}/allocations`，请求体为 `{"allocation_id":"<allocation_id>","credential":"<credential>","connection_id":"<connection_id>"}`。Control Plane 验证签名、expiry、数据库 Allocation/Agent/Session/Peer 绑定和 Peer 活跃状态，然后原子地把 Allocation 标记为 `connected`，或在相同 `connection_id` 下确认 pending expiry 并原子延长 lease。成功 ACK 数据包含可信的 `allocation_id`、`agent_id`、`session_id`、`peer_id`、`peer_role`、`connection_id`、`expires_at`。Agent 必须按返回的 Session 和 Peer 信息配对，不能相信客户端另行声称的 Session/Peer/role。

若同一 `connection_id` 的 ACK 因 HTTP 超时重试，Control Plane 幂等返回同一可信绑定；不同连接尝试消费已连接的 Credential 会以 HTTP 429 `RELAY_LIMIT_REACHED` 拒绝。Agent 连接断开时，调用 `POST /api/internal/v1/relay/agents/{agentId}/revoke`，提交 `{"allocation_id":"...","connection_id":"..."}`；服务端验证绑定后撤销并广播 `relay.revoked`，且保留原 `connection_id`。同一断开撤销请求可安全重试。Agent 应在 Allocation 的 `expires_at` 到期时强制断开，不能依赖实时撤销事件。

Agent 确认后向客户端发送 `{"op":"auth_ok"}`。之后的 WSS binary payload 遵守 MLR1 数据通道协议，帧类型包括 `TCP_DATA`、`TCP_CLOSE`、`UDP_DATAGRAM`。Agent 只在同 Session 的已认证 Peer 间按 MLR1 路由规则转发，不解析游戏载荷。Control Plane 不代理、转发或存储游戏数据。旧 LanLink Relay 的 `LLK1`/`LLKU` 协议使用 16 字节 legacy `roomToken`，与 V1 Credential 不兼容；旧客户端应收到更新要求，新版使用这里定义的 WSS AUTH 接入流程。

## Relay Agent 内部协议

这些接口不在 Public OpenAPI 中：

```text
POST /api/internal/v1/relay/agents/register
POST /api/internal/v1/relay/agents/{id}/heartbeat
POST /api/internal/v1/relay/agents/{id}/allocations
POST /api/internal/v1/relay/agents/{id}/revoke
```

`POST /register` 请求为 `{agent_id, endpoint, region?, capacity, capabilities?}`；成功返回 `{agent_id, registered:true, expires_in:45}`。`POST /{id}/heartbeat` 无请求体，返回 `{agent_id, accepted:true, expires_in:45}`。`POST /{id}/allocations` 是一次性 Credential 消费和连接确认，接收 `{allocation_id, credential, connection_id}`，返回以下可信绑定对象；`expires_at` 序列化为 ISO 8601 时间：

```json
{
  "success": true,
  "data": {
    "allocation_id": "rly_...",
    "agent_id": "official-eu-1",
    "session_id": "ses_...",
    "peer_id": "peer_...",
    "peer_role": "member",
    "connection_id": "conn_...",
    "expires_at": "2026-10-01T12:00:00.000Z"
  }
}
```

相同连接 ID 的重试幂等；`reauth` 的新 Credential 必须继续使用原 `connection_id`，ACK 后才将待确认的 `expires_at` 提升为正式 lease。已连接到其他 connection ID 的 Allocation 被拒绝。`POST /{id}/revoke` 接收 `{allocation_id, connection_id?}`；如果 Allocation 已连接，必须提供原 connection ID。成功或重复撤销返回 `{"success":true,"data":{"allocation_id":"rly_...","revoked":true}}`；已过期时返回 `{"success":true,"data":{"allocation_id":"rly_...","revoked":false,"status":"expired"}}`。撤销只改状态，不清空原 connection ID。以上内部成功响应使用 legacy envelope；credential 仅允许经 HTTPS 机器凭证发送，不得记入请求日志。

所有请求通过 Forum HTTPS 入口并携带 `X-Relay-Machine-Credential`。服务端 Guard 使用 timing-safe 比较校验机器凭证；缺失或错误的凭证以 `AUTH_REQUIRED` 拒绝。入口仍由生产 HTTPS/TLS 终止层保护，普通第三方 API 客户端没有该机器凭证，不能调用 Agent 控制操作。

## 错误码

稳定的业务错误码包括 `AUTH_REQUIRED`、`TOKEN_INVALID`、`TOKEN_EXPIRED`、`SCOPE_REQUIRED`/`INSUFFICIENT_SCOPE`、`USER_BLOCKED`、`FRIEND_REQUIRED`、`PRIVACY_DENIED`、`CLIENT_CAPABILITY_NOT_APPROVED`、`PRESENCE_CONNECTION_NOT_FOUND`、`ACTIVITY_INVALID`、`SESSION_NOT_FOUND`、`SESSION_EXPIRED`、`SESSION_CLOSED`、`SESSION_FULL`、`SESSION_NOT_JOINABLE`、`SESSION_PERMISSION_DENIED`、`PEER_NOT_FOUND`、`PEER_EXPIRED`、`PEER_RESUME_INVALID`、`CANDIDATE_INVALID`、`CANDIDATE_LIMIT_REACHED`、`INVITE_NOT_FOUND`、`INVITE_EXPIRED`、`INVITE_ALREADY_ACCEPTED`、`JOIN_REQUEST_REQUIRED`、`JOIN_REQUEST_EXPIRED`、`JOIN_INTENT_INVALID`、`JOIN_INTENT_CLIENT_MISMATCH`、`JOIN_INTENT_EXPIRED`、`JOIN_INTENT_CONSUMED`、`JOIN_INTENT_RECOVERY_EXPIRED`、`JOIN_INTENT_RECOVERY_UNAVAILABLE`、`RELAY_UNAVAILABLE`、`RELAY_LIMIT_REACHED`、`RATE_LIMITED`。客户端依 `error.code` 和 HTTP 状态，不依赖 message。

## 验证边界

```sh
npm run build:backend
npm run build:frontend
npm test -- --runInBand
npm run openapi:export
npm run openapi:check
```

后端 Jest 是项目单元/服务契约套件。Forum v1 已使用隔离 MariaDB 与 Redis 完成双用户 HTTP 联调，覆盖好友、Presence 多客户端、Activity、聚合、Session、Candidate、Invite、Join Request/Intent、Resume、Relay Allocation、Invisible、Block、Realtime 10 并发连接与 Resume，以及并发 heartbeat。真实 Relay Agent 数据转发、游戏包抓取、生产 HTTPS 入口与机器凭证部署、真实公网压力及客户端设备验收仍需在相应测试环境验证，不能由本地联调代替。
