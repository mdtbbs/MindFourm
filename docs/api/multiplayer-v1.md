# 多人联机 API V1

## 接入流程

论坛负责账号、好友和联机控制信令，包括在线状态、会话、网络候选地址交换与官方中继凭证分配。客户端负责 STUN/NAT 探测、P2P 建连和 Mindustry 协议接入。游戏数据在客户端之间传输；P2P 不通时经过官方中继代理服务。论坛 API 服务不转发或保存游戏数据包。

1. 在 MindAuth 注册公开客户端，使用授权码模式 + PKCE S256。只申请产品实际需要的权限范围；启动器集成另需提交启动 URI 模板并申请对应客户端能力。
2. 请求 `GET /api/v1/capabilities`，确认 `multiplayer` 下需要的功能开关已启用。第三方客户端还需要获批 `third_party_multiplayer_v1` 能力。
3. 客户端登录后调用 `POST /api/v1/presence/connections` 创建在线连接。请求中的 `platform` 表示客户端类型；服务端返回连接 ID 和心跳间隔。
4. 调用 `PUT /api/v1/presence/connections/{connection_id}/activity` 发布游戏状态。应用名称和图标由已审核的 OAuth 客户端资料提供，客户端无需重复提交。
5. 调用 `POST /api/v1/multiplayer/sessions` 创建会话，再按服务端返回的策略加入、邀请或请求加入。连接建立后，双方分别提交网络候选地址。
6. 如需实时事件，申请一次性 WebSocket 票据后连接 `/realtime/v1`。断线重连时发送各事件流的 `last_event_id`；若收到 `resume_failed`，重新获取快照。

公共 JSON 接口位于 `/api/v1/*`，成功响应使用 `{data, meta}`，错误通过稳定的 `error.code` 标识。论坛 Cookie 和移动端会话继续按第一方规则处理；MindAuth Bearer 按请求所需的权限范围校验。第三方联机功能还受站点开关和应用能力审核控制。

## 接口一览

| 方法 | 路径 | 权限范围 | 用途 |
|---|---|---|---|
| GET/PATCH | `/api/v1/social/privacy` | `presence.read` / `presence.write` | 读写在线状态、活动状态和联机权限 |
| GET | `/api/v1/social/friends/presence?page=1&limit=50` | `friends.read presence.read` | 第一方聚合好友、在线状态、活动状态、客户端资料、隐私和动作；最多 50 人/页 |
| GET/POST | `/api/v1/friends`、`/api/v1/friends/requests` | `friends.read` | 好友和好友请求 |
| GET | `/api/v1/friends/requests` | `friends.read` | 待处理请求 |
| POST | `/api/v1/friends/requests/{id}/accept`、`.../{id}/reject` | `friends.read` | 接受/拒绝好友请求 |
| DELETE | `/api/v1/friends/{userId}` | `friends.read` | 删除好友 |
| GET/POST/DELETE | `/api/v1/blocks`、`/api/v1/users/{id}/block` | `friends.read` | 查询、屏蔽和解除屏蔽 |
| POST | `/api/v1/presence/connections` | `presence.write` | 创建在线连接 |
| PATCH/DELETE | `/api/v1/presence/connections/{id}` | `presence.write` | 更新或删除在线连接 |
| POST | `/api/v1/presence/connections/{id}/heartbeat` | `presence.write` | 在线状态心跳 |
| PUT/DELETE | `/api/v1/presence/connections/{id}/activity` | `presence.write` | 发布或清除富活动状态 |
| GET/PATCH | `/api/v1/multiplayer/preferences` | `multiplayer.read` / `multiplayer.write` | 读取/设置用户默认加入意图客户端 |
| GET | `/api/v1/multiplayer/capabilities` | `multiplayer.read` | 多人联机能力与约束 |
| POST | `/api/v1/multiplayer/sessions` | `multiplayer.write` | 创建会话；可选可见范围、join_policy、max_players |
| GET | `/api/v1/multiplayer/sessions/{id}`、`.../{id}/peers` | `multiplayer.read` | 查询可见会话和对端 |
| POST | `/api/v1/multiplayer/sessions/resolve-code` | `multiplayer.read` | 解析不公开会话加入码 |
| POST | `/api/v1/multiplayer/sessions/{id}/join`、`.../{id}/leave` | `multiplayer.write` | 加入/退出或用绑定的恢复令牌恢复对端 |
| POST | `/api/v1/multiplayer/sessions/{id}/peers/{peerId}/heartbeat` | `multiplayer.write` | 对端心跳 |
| POST | `/api/v1/multiplayer/sessions/{id}/candidates` | `multiplayer.write` | 发布候选地址 |
| GET | `/api/v1/multiplayer/sessions/{id}/peers/{peerId}/candidates` | `multiplayer.read` | 读取对端候选地址 |
| DELETE | `/api/v1/multiplayer/sessions/{id}/candidates/{candidateId}` | `multiplayer.write` | 删除候选地址 |
| POST | `/api/v1/multiplayer/invites` | `multiplayer.write` | 创建邀请 |
| GET | `/api/v1/multiplayer/invites` | `multiplayer.read` | 列出自己的邀请 |
| POST | `/api/v1/multiplayer/invites/{id}/accept`、`.../decline`、`.../revoke` | `multiplayer.write` | 处理邀请；接受返回加入意图 |
| POST | `/api/v1/multiplayer/sessions/{id}/join-requests` | `multiplayer.write` | 请求加入 `join_policy=request` 的会话 |
| POST | `/api/v1/multiplayer/join-requests/{id}/approve`、`.../reject` | `multiplayer.write` | 房主批准/拒绝；批准返回 10 分钟有效、绑定申请者 OAuth 客户端的加入意图 |
| POST | `/api/v1/multiplayer/sessions/{id}/join-intents` | `multiplayer.write` | 创建 60 秒、绑定用户的加入意图；不预绑定 OAuth 客户端；可传不公开 `join_code` |
| POST | `/api/v1/multiplayer/join-intents/{id}/consume` | `multiplayer.write` | 启动器使用加入意图并成为会话对端；同一用户和首次使用的客户端可在 10 分钟内恢复相同对端与恢复令牌 |
| POST | `/api/v1/multiplayer/sessions/{id}/relay` | `multiplayer.write` | 为当前对端请求官方中继凭证 |
| POST | `/api/v1/realtime/tickets` | `friends.read` | 创建有效期 60 秒的一次性 WebSocket 票据 |

会话可见范围为 `private`、`friends`、`unlisted`；加入策略为 `open`、`friends`、`request`、`invite_only`。V1 没有公共大厅或房主迁移。房主主动离开后，会话进入既有的 60 秒关闭宽限期；只有同一用户、同一 OAuth 客户端并提供有效的一次性恢复令牌，才能恢复会话。房主心跳超时后，在线状态租期在 90 秒后到期，会话随之进入关闭状态。对端另有独立的 60 秒恢复窗口；它与会话关闭宽限期是两种状态期限，即使当前时长相同也分别判定。

好友在线状态返回的 `actions.can_join`、`can_request_join`、`can_invite` 是后端策略结果。客户端不得自行推导按钮权限。屏蔽规则优先于隐私设置；好友聚合最多批量查询一页，不会为每位好友单独执行一组 SQL。

## 请求参数与响应

下面的 JSON 展示 `data` 的业务内容；公共 V1 成功响应外层还包含 `meta.request_id`。所有 ID（例如 `connection_id`、`session_id`、`peer_id`、`invite_id`、`intent_id`）均是不透明字符串，只能原样传回。除好友用户 ID 外，不要自行解析 ID，也不要提交 `user_id`、`client_id`、对端 role 等由令牌或服务端确定的字段。

### 隐私设置与好友

`GET /api/v1/social/privacy` 返回当前账号设置。`PATCH` 只更新请求中提供的字段，不提交的项保持原值：

| 字段 | 类型 | 可选值 / 含义 |
|---|---|---|
| `presence_visibility` | string | `everyone`、`friends`、`nobody`；谁能看到在线状态。 |
| `activity_visibility` | string | 同上；谁能看到富活动状态。 |
| `allow_join` | string | 同上；谁能通过普通加入流程加入你的会话。 |
| `allow_join_request` | string | 同上；谁能向你发送加入请求。 |
| `allow_invites` | string | 同上；谁能向你发送联机邀请。 |
| `show_last_seen` | boolean | 是否向可查看状态的人展示上次在线时间。 |
| `status` | string | GET 响应中的当前状态：`online`、`idle`、`dnd`、`invisible`。它不是隐私 PATCH 字段；通过创建或更新在线连接设置。 |

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

富活动状态由当前连接提交到 `PUT /api/v1/presence/connections/{id}/activity`：

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
| `type` | 是 | `playing`、`hosting`、`editing`、`browsing`、`downloading`、`uploading`、`launcher`、`custom` | 活动状态类型。 |
| `name` | 是 | 非空字符串，最多 160 字符 | 活动状态主标题。 |
| `details` / `state` | 否 | 字符串，各最多 300 字符 | 次级文字与状态说明。 |
| `game.id` | 有 `game` 时必填 | 字符串，最多 128 字符 | 游戏稳定标识。`game.version` 可选，最多 64 字符。 |
| `party.current` / `party.max` | 否 | 0–10000 整数 | 当前人数与队伍上限。 |
| `timestamps.started_at` | 否 | 非负 Unix 秒 | 活动状态开始时间。 |
| `join.session_id` | 否 | 当前用户活跃对端所属会话 ID | 允许好友查看时提供可加入会话；服务端会检查归属。 |

活动状态的 `client_id`、`platform`、`updated_at` 由已认证连接补齐。第三方应用的名称、图标、开发者信息来自 MindAuth 审核后的应用资料，不能在活动状态请求体中伪造。`DELETE .../{id}/activity` 清除活动状态，响应为 `{"removed":true}`。

### 好友在线聚合

```http
GET /api/v1/social/friends/presence?page=1&limit=50
Authorization: Bearer <ACCESS_TOKEN>
```

| 查询参数 | 默认 | 限制 / 含义 |
|---|---:|---|
| `page` | 1 | 从 1 开始的页码。 |
| `limit` | 50 | 每页好友数，范围 1–50。 |

响应外层封装中的 `data.data` 是每位好友一项的数组，`data.pagination` 保留分页摘要；标准翻页字段同时位于 `meta.pagination`，其中 `total_pages` 与 `has_more` 由 API 规范化生成。客户端优先读取 `meta.pagination`：

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
| `activity` | 富活动状态或 `null`。其中 `client` 是审核目录里的客户端公开资料；无权查看的活动或加入会话信息会被剔除。 |
| `actions.can_join` | 当前查看者能否直接加入该好友展示的会话。 |
| `actions.can_request_join` | 当前查看者能否请求加入该会话。 |
| `actions.can_invite` / `invite_session_id` | 当前查看者能否邀请该好友进入自己所在的会话，以及可用于邀请的会话 ID。 |
| `actions.session_visible` | 当前查看者能否看到关联会话。 |

上面 `actions` 全部由服务器按屏蔽关系、隐私设置、会话策略与名额计算，客户端应直接使用这些结果。

## 联机会话参数与示例

### 能力、客户端偏好与会话

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

四个布尔值表示会话、邀请、中继和第三方应用功能当前是否启用；先检查这些值和顶层 `multiplayer` 能力标志，再展示功能。`GET /api/v1/multiplayer/preferences` 返回 `default_client_id` 与 `clients`。PATCH 请求体可提交 `{"client_id":"desktop-launcher"}`；`client_id` 必须来自返回的 `clients`。发送 `null` 或省略表示清除默认启动器。客户端对象包含 `client_id`、`name`、`application_icon_url`、`developer_name`、`developer_url`、`supports_presence`、`supports_multiplayer`、`supports_join_intent`、`launch_uri_template`。

创建会话：

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
| `activity_name` | 否 | 最多 160 字符 | 好友看到的会话活动文字；缺省使用 `game_id`。 |
| `visibility` | 否 | `private`、`friends`、`unlisted` | 缺省 `private`。不公开会在创建结果中返回一次性展示的 `join_code`。 |
| `join_policy` | 否 | `open`、`friends`、`request`、`invite_only` | 缺省 `friends`；`private + open` 不允许。 |
| `max_players` | 否 | 2–64 整数 | 缺省 8。 |

创建响应包含 `session`、`peer`、`resume_token`，不公开会话还包含 `join_code`。立即安全保存 `resume_token`；它绑定用户和 OAuth `client_id`、只能使用一次，断线恢复后会旋转出新令牌。

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

会话对象中的 `current_players` 是当前占用人数：`joining`、`active` 和仍在恢复窗口内的 `disconnected` 对端都占用名额；`expired` 对端不占名额。对端心跳每 30 秒发送一次；90 秒未收到心跳后状态变为 `disconnected`，服务端清理其网络候选和中继分配，并保留 60 秒恢复窗口。此窗口按最后一次心跳的在线状态租期截止时间计算；窗口结束后对端变为 `expired`，恢复令牌不再可用，名额释放。`expires_at` 是会话最长生命周期截止时间。对端对象的 `role` 为 `owner` 或 `member`，`status` 是 `joining`、`active`、`disconnected`、`expired` 等服务端状态；`capabilities` 是客户端加入时提交的可选 JSON。`GET .../sessions/{id}/peers` 返回仍占用名额的对端数组；该接口要求调用者本身是活跃对端。

### 解析、加入、退出和恢复

不公开加入码用 `POST /api/v1/multiplayer/sessions/resolve-code` 解析，请求体为 `{"code":"A1B2C3D4E5"}`（10 位十六进制码）。加入码只应作为短期邀请信息分享。公开或好友策略允许的直接加入可用：

```http
POST /api/v1/multiplayer/sessions/ses_AbCdEf0123456789_-wxyz/join
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{"capabilities":{"transport":["udp","tcp"],"game_version":"v157"}}
```

| 请求体字段 | 是否必填 | 含义 |
|---|---|---|
| `invite_id` | 否 | 通过邀请加入时使用目标用户收到的有效邀请 ID。 |
| `join_code` | 否 | 加入不公开会话时提交对应加入码。 |
| `resume_token` | 否 | 恢复既有对端时提交；若提供则优先执行恢复。成功后旧令牌作废并返回新令牌。 |
| `capabilities` | 否 | 客户端可选能力 JSON；服务端作为该对端信息返回，不会据此授予权限。 |

新加入返回 `{ "peer": ..., "resume_token": "..." }`。即使 join 请求体没有可选字段，也发送 `{}`；恢复时还会有 `resumed: true`。恢复只能在对端的 60 秒恢复窗口内完成；过期对端不可恢复。`POST .../sessions/{id}/leave` 不需要请求体；普通成员返回 `{ "status":"left" }`，房主主动退出返回 `{ "status":"closing","grace_seconds":60 }`。调用 `POST .../sessions/{id}/peers/{peerId}/heartbeat` 续期活跃对端，响应含 `peer_id`、30 秒 `heartbeat_interval` 和 90 秒 `expires_in`。

若加入策略要求审批，客户端先创建加入请求。请求有效期为 5 分钟；房主批准后，申请者会收到绑定当前 OAuth 客户端的加入意图。申请者使用该意图后即可加入会话；重复使用会在恢复窗口内返回相同结果。处理批准事件时，客户端应先成功使用意图并保存本地事件游标，再发送确认消息；启动器跳转前应由用户确认。

不公开会话可通过加入码创建直接加入意图。意图绑定当前论坛用户，须在 60 秒内首次使用；相同用户和 OAuth 客户端可在 10 分钟恢复窗口内重新取得成功结果。

直接创建、接受邀请和房主批准的意图都有明确的有效期与消费身份约束。消费失败时按稳定错误码处理；已经消费的意图不会重新授予加入权限。

已批准的加入请求意图仍绑定申请时提供的 OAuth 客户端，保留上文所述的 10 分钟恢复期限和实时事件确认规则。直接创建和接受邀请得到的意图则在首次成功使用时绑定客户端。


### 网络候选地址交换

每个活跃对端用自己的令牌发布候选地址；地址只在同会话内对端之间短期交换。请求示例：

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
| `metadata` | 否 | 任意 JSON 对象，序列化后不超过 1 KiB。不要放令牌或敏感信息。 |

发布返回 `candidate_id` 与 90 秒 `expires_in`。对同一对端重复发布相同的 `kind`、`transport`、`address`、`port` 会续期并复用原 `candidate_id`，适合客户端定期刷新候选而不堆积重复记录。通过 `GET .../sessions/{id}/peers/{peerId}/candidates` 读取的是候选地址数组，每项含 `candidate_id`、`peer_id`、上述网络字段及 `created_at`（Unix 毫秒）。每对端最多 32 条；用 `DELETE .../candidates/{candidateId}` 删除本人发布的候选。

### 邀请与中继

创建邀请的请求体为 `{"session_id":"ses_AbCdEf0123456789_-wxyz","target_user_id":456}`。`session_id` 必须属于当前活跃对端，`target_user_id` 是论坛用户整数 ID；邀请 5 分钟过期。目标用户 GET `/api/v1/multiplayer/invites` 收到的是数组，元素含 `invite_id`、`session_id`、`sender_user_id`、`target_user_id`、`status`、`expires_at` 和会话摘要 `session`。接受邀请返回 `join_intent`；拒绝/撤销不需要请求体，返回更新后的 `status`。

公共中继分配 `POST /api/v1/multiplayer/sessions/{id}/relay` 不需要请求体，返回如下结构：

```json
{
  "allocation_id":"rly_AbCdEf0123456789_-wxyz",
  "agent_id":"official-eu-1",
  "endpoint":"wss://relay.example.invalid:443/relay/v1",
  "credential":"<SHORT_LIVED_CREDENTIAL>",
  "expires_in":120
}
```

`credential` 是短期秘密，只允许放入 WSS 第一条 AUTH 文本帧，不可放在 URL、查询参数、日志或分析事件里。凭证使用方式和 HTTPS 代理服务协议见下文中继专节。

### WebSocket 票据

公共实时消息 WebSocket 不能直接把 OAuth 访问令牌放进 URL。先用 `friends.read` 权限范围调用 `POST /api/v1/realtime/tickets`（无请求体）：

```json
{"ticket":"<ONE_TIME_TICKET>","expires_in":60,"websocket_path":"/realtime/v1"}
```

将返回的短期票据作为 `/realtime/v1?ticket=...` 的一次性连接凭证；连接成功后立即失效，60 秒内未使用也会过期。不要记录票据或分享给其他用户。WebSocket 事件流和断线续传格式见下一节。

## WebSocket 实时事件

WebSocket 地址为当前 API 主机上的 `/realtime/v1`。WebSocket 首帧 `hello` 含心跳间隔。客户端发送：

```json
{"type":"heartbeat"}
{"type":"subscribe","sessions":["ses_AbCdEf0123456789_-wxyz"]}
{"type":"ack","stream":"user","id":"1790758200000-0"}
{"type":"resume","last_event_id":"1790758200000-0","sessions":{"ses_AbCdEf0123456789_-wxyz":"1790758200000-1"}}
```

服务端支持 `hello`、`heartbeat_ack`、`subscribed`、`event`、`ack`、`error`、`resumed` 和 `resume_failed`。每条事件包含 `id`、`event`、`timestamp`、`data`；用户和会话事件可分别订阅。事件流最多保留 600 秒，恢复最多补发 200 条；游标已过期或无法恢复时，客户端应重新读取快照。对端状态以 API 返回的最新会话和对端快照为准。

事件名：`friend.request.created`、`friend.request.accepted`、`friend.removed`、`presence.updated`、`activity.updated`、`multiplayer.invite.created`、`multiplayer.invite.accepted`、`multiplayer.invite.revoked`、`multiplayer.join_request.created`、`multiplayer.join_request.approved`、`multiplayer.join_request.rejected`、`session.updated`、`session.closed`、`peer.joined`、`peer.updated`、`peer.disconnected`、`peer.left`、`candidate.created`、`candidate.removed`、`relay.allocated`、`relay.revoked`。

`multiplayer.join_request.approved` 发给申请者的原 OAuth 客户端，`data` 包含 `join_request_id`、`session_id` 和可传给启动器的 `intent_id`。批准事件会在处理完成前重发；`intent_id` 在批准后 10 分钟失效。相同用户和客户端在结果恢复窗口内重新使用意图会得到相同结果。客户端只有在成功使用意图后才发送确认消息；崩溃后收到新事件 ID 时，可重复使用意图并恢复结果。

## 功能可用性

多人联机能力按站点配置和应用审核状态动态启用。客户端应先读取 `GET /api/v1/capabilities` 与 `GET /api/v1/multiplayer/capabilities`，并在功能不可用时按稳定错误码提示用户。服务器部署、中继服务注册和运维配置不属于第三方公开 API。

中继凭证是短期秘密。客户端只应在 WSS 建连后的首个认证帧中使用，并在内存中短暂保留；不得放入 URL、查询参数、子协议名、日志或分析事件。收到 `auth_ok` 后，后续二进制帧按已公布的客户端数据通道格式传输。

## 错误码

稳定的业务错误码包括 `AUTH_REQUIRED`、`TOKEN_INVALID`、`TOKEN_EXPIRED`、`SCOPE_REQUIRED`/`INSUFFICIENT_SCOPE`、`USER_BLOCKED`、`FRIEND_REQUIRED`、`PRIVACY_DENIED`、`CLIENT_CAPABILITY_NOT_APPROVED`、`PRESENCE_CONNECTION_NOT_FOUND`、`ACTIVITY_INVALID`、`SESSION_NOT_FOUND`、`SESSION_EXPIRED`、`SESSION_CLOSED`、`SESSION_FULL`、`SESSION_NOT_JOINABLE`、`SESSION_PERMISSION_DENIED`、`PEER_NOT_FOUND`、`PEER_EXPIRED`、`PEER_RESUME_INVALID`、`CANDIDATE_INVALID`、`CANDIDATE_LIMIT_REACHED`、`INVITE_NOT_FOUND`、`INVITE_EXPIRED`、`INVITE_ALREADY_ACCEPTED`、`JOIN_REQUEST_REQUIRED`、`JOIN_REQUEST_EXPIRED`、`JOIN_INTENT_INVALID`、`JOIN_INTENT_CLIENT_MISMATCH`、`JOIN_INTENT_EXPIRED`、`JOIN_INTENT_CONSUMED`、`JOIN_INTENT_RECOVERY_EXPIRED`、`JOIN_INTENT_RECOVERY_UNAVAILABLE`、`RELAY_UNAVAILABLE`、`RELAY_LIMIT_REACHED`、`RATE_LIMITED`。客户端依据 `error.code` 和 HTTP 状态处理错误，不依赖提示文字。

## 客户端恢复

实时消息事件用于低延迟更新界面，不应取代 API 快照。断线或收到 `resume_failed` 后重新读取当前会话、好友和对端状态；对可重试的请求，按错误码、状态码和 `request_id` 处理。
