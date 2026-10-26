# 多人联机 API V1

OAuth 应用的 Presence/Multiplayer 资格随统一 forum 范围生效，不再另查 MindAuth 应用目录的能力审批。应用目录仅用于展示身份、图标和加入意图的启动目标；既有细分 scope、业务权限与站点开关继续生效。


## 接入流程

论坛负责账号、好友和联机控制信令，包括在线状态、会话、网络候选地址交换与官方中继凭证分配。客户端负责 STUN/NAT 探测、P2P 建连和 Mindustry 协议接入。游戏数据在客户端之间传输；P2P 不通时经过官方中继代理服务。论坛 API 服务不转发或保存游戏数据包。

1. 在 MindAuth 注册公开客户端，使用授权码模式 + PKCE S256，并启用论坛访问。只申请产品实际需要的权限范围；若要处理加入意图，还需在客户端公开资料中配置受信任的启动 URI 模板。
2. 请求 `GET /api/v1/capabilities`，确认 `multiplayer` 下需要的站点功能已启用。Presence/Multiplayer 不另查 MindAuth 应用目录的逐项能力审批；每个接口仍校验 OAuth 范围、用户权限、隐私与站点开关。
3. 客户端登录后调用 `POST /api/v1/presence/connections` 创建在线连接。请求中的 `platform` 表示客户端类型；服务端返回连接 ID 和心跳间隔。
4. 调用 `PUT /api/v1/presence/connections/{connection_id}/activity` 发布游戏状态。应用名称和图标由已审核的 OAuth 客户端资料提供，客户端无需重复提交。
5. 调用 `POST /api/v1/multiplayer/sessions` 创建会话，再按服务端返回的策略加入、邀请或请求加入。连接建立后，双方分别提交网络候选地址。
6. 如需实时事件，申请一次性 WebSocket 票据后连接 `/realtime/v1`。断线重连时发送各事件流的 `last_event_id`；若收到 `resume_failed`，重新获取快照。

公共 JSON 接口位于 `/api/v1/*`，成功响应使用 `{data, meta}`，错误通过稳定的 `error.code` 标识。论坛 Cookie 和移动端会话继续按第一方规则处理；MindAuth Bearer 按请求所需的权限范围校验。第三方联机还受应用整体审核和站点开关控制，无需逐项审批能力。

## 接入角色与允许路径

| 角色 | 允许的路径 | 当前状态 |
| --- | --- | --- |
| 第三方 Mod / 启动器 / 桌面客户端 | MindAuth 公开客户端 OAuth + `/api/v1/presence/*`、`/api/v1/multiplayer/*`、`/api/v1/realtime/*` | 公开；以论坛授权与站点开关为准 |
| 第三方游戏服务（server-to-server） | 无公共身份接口 | **未开放**；服务端凭证不属于公开客户端契约 |
| Relay Agent operator | 无公开机器接口说明 | 未作为第三方产品开放，属于 MDTBBS 基础设施边界 |

本页只描述上表第一行的公开契约。第三方客户端提交的 `client_id`、对端 role 一类身份字段不会被采纳：`client_id` 由服务端从 MindAuth 令牌内省结果派生，未被接口声明的字段由请求校验拒绝。

## 三道独立门槛

联机 API 同时受三道门槛约束，缺一即失败：

| 门槛 | 控制方 | 失败表现 |
| --- | --- | --- |
| OAuth 权限范围（用户授权） | 用户在 MindAuth 授权页逐项同意；论坛按令牌实际授予的 scope 校验 | 403 `INSUFFICIENT_SCOPE` |
| 应用整体接入 | MindAuth 整体审核应用及论坛接入选项 | 无效或已撤销的令牌被拒绝 |
| 站点功能开关（平台开放） | 站点运营配置：会话、邀请、中继与第三方联机开关 | 403 `FEATURE_DISABLED` |

创建公开客户端后等待应用整体审核；论坛范围一并包含联机和在线状态，不再查询目录 capability 进行二次审批。用户授权、站点开关与业务权限仍需满足。接口表中的细分 scope 是旧客户端兼容名称，新应用直接请求 forum。

## 接口一览

| 方法 | 路径 | 权限范围 | 用途 |
|---|---|---|---|
| GET/PATCH | `/api/v1/social/privacy` | `presence.read` / `presence.write` | 读写在线状态、活动状态和联机权限 |
| GET | `/api/v1/social/friends/presence?page=1&limit=50` | `friends.read presence.read` | 第一方聚合好友、在线状态、活动状态、客户端资料、隐私和动作；最多 50 人/页 |
| GET/POST | `/api/v1/friends`、`/api/v1/friends/requests` | `friends.read` | 好友和好友请求 |
| GET | `/api/v1/friends/requests` | `friends.read` | 待处理请求 |
| POST | `/api/v1/friends/requests/{id}/accept`、`.../{id}/reject` | `friends.read` | 接受/拒绝好友请求 |
| DELETE | `/api/v1/friends/{userId}` | `friends.read` | 删除好友 |
| GET | `/api/v1/users/search?q=builder&limit=10` | `friends.read` | 搜索非好友公开用户；排除自己、好友及屏蔽关系 |
| GET/POST/DELETE | `/api/v1/blocks`、`/api/v1/users/{id}/block` | `friends.read` | 查询、屏蔽和解除屏蔽 |
| POST | `/api/v1/presence/connections` | `presence.write` | 创建在线连接 |
| PATCH/DELETE | `/api/v1/presence/connections/{id}` | `presence.write` | 更新或删除在线连接 |
| POST | `/api/v1/presence/connections/{id}/heartbeat` | `presence.write` | 在线状态心跳 |
| PUT/DELETE | `/api/v1/presence/connections/{id}/activity` | `presence.write` | 发布或清除富活动状态 |
| GET/PATCH | `/api/v1/multiplayer/preferences` | `multiplayer.read` / `multiplayer.write` | 读取/设置用户默认加入意图客户端 |
| GET | `/api/v1/multiplayer/capabilities` | `multiplayer.read` | 多人联机能力与约束 |
| GET | `/api/v1/multiplayer/sessions` | `multiplayer.read` | 公开联机大厅；按可见范围列出可发现的会话（`page`/`limit`，最多 50/页） |
| POST | `/api/v1/multiplayer/sessions` | `multiplayer.write` | 创建会话；每账号最多一个活跃会话 |
| GET | `/api/v1/multiplayer/sessions/{id}`、`.../{id}/peers` | `multiplayer.read` | 查询可见会话和对端 |
| POST | `/api/v1/multiplayer/sessions/resolve-code` | `multiplayer.read` | 解析不公开会话加入码 |
| POST | `/api/v1/multiplayer/sessions/{id}/join`、`.../{id}/leave` | `multiplayer.write` | 加入/退出或用绑定的恢复令牌恢复对端 |
| POST | `/api/v1/multiplayer/sessions/{id}/peers/{peerId}/heartbeat` | `multiplayer.write` | 对端心跳 |
| POST | `/api/v1/multiplayer/sessions/{id}/candidates` | `multiplayer.write` | 发布候选地址 |
| GET | `/api/v1/multiplayer/sessions/{id}/peers/{peerId}/candidates` | `multiplayer.read` | 读取对端候选地址 |
| DELETE | `/api/v1/multiplayer/sessions/{id}/candidates/{candidateId}` | `multiplayer.write` | 删除候选地址 |
| POST | `/api/v1/multiplayer/invites` | `multiplayer.write` | 创建邀请 |
| GET | `/api/v1/multiplayer/invites?page=1&limit=50` | `multiplayer.read` | 分页列出收到的待处理邀请 |
| POST | `/api/v1/multiplayer/invites/{id}/accept`、`.../decline`、`.../revoke` | `multiplayer.write` | 处理邀请；接受返回加入意图 |
| POST | `/api/v1/multiplayer/sessions/{id}/join-requests` | `multiplayer.write` | 请求加入 `join_policy=request` 的会话 |
| POST | `/api/v1/multiplayer/join-requests/{id}/approve`、`.../reject` | `multiplayer.write` | 房主批准/拒绝；批准返回 10 分钟有效、绑定申请者 OAuth 客户端的加入意图 |
| POST | `/api/v1/multiplayer/sessions/{id}/join-intents` | `multiplayer.write` | 创建 60 秒、绑定用户的加入意图；不预绑定 OAuth 客户端；可传房间码 `join_code` |
| POST | `/api/v1/multiplayer/join-intents/{id}/consume` | `multiplayer.write` | 启动器使用加入意图并成为会话对端；同一用户和首次使用的客户端可在 10 分钟内恢复相同对端与恢复令牌 |
| POST | `/api/v1/multiplayer/sessions/{id}/relay` | `multiplayer.write` | 为当前对端请求官方中继凭证 |
| POST | `/api/v1/realtime/tickets` | `friends.read` | 创建有效期 60 秒的一次性 WebSocket 票据 |

**可见范围 `visibility`（单选）**回答“谁能发现或查看这个房间”：`private`（仅房主与已在房内的活跃对端；不会出现在联机大厅列表）、`friends`（房主好友）、`public`（所有人）。`GET /multiplayer/sessions` 是发现列表，始终不返回 `private` 会话；知道会话 ID 的房主或活跃对端仍可通过受权的单会话接口读取它。

**加入权限 `join_policy`（单选）**回答“谁有资格加入”：`invite_only`（仅持有当前有效邀请或已批准加入请求的用户）、`friends`（房主好友）、`public`（所有通过基础登录、封禁、容量、会话状态检查的用户）。

两者正交，九种组合都有明确语义。`visibility` 只控制发现与展示，绝不隐式决定是否能加入；房间码、邀请链接、大厅入口都只是入口（transport），不是权限。**`require_approval`** 独立于两者：开启后即使已符合 `join_policy`，仍需房主批准加入请求（`private + public + require_approval` 即旧 `request` 语义）。

V1 没有房主迁移。房主主动离开后，会话进入既有的 60 秒关闭宽限期；只有同一用户、同一 OAuth 客户端并提供有效的一次性恢复令牌，才能恢复会话。房主心跳超时后，在线状态租期在 90 秒后到期，会话随之进入关闭状态。对端另有独立的 60 秒恢复窗口；它与会话关闭宽限期是两种状态期限，即使当前时长相同也分别判定。

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

响应为 `{"connection_id":"prs_…","heartbeat_interval":30,"expires_in":90}`。每个客户端实例应单独创建连接，并每 30 秒调用 `POST /api/v1/presence/connections/{id}/heartbeat`；90 秒没有心跳时连接过期。每账号最多 32 条有效 Presence 连接；超限返回 `409 PRESENCE_CONNECTION_LIMIT_REACHED`。任意一条连接有效时账号在线；删除一个连接只结束该连接，所有连接均失效或删除后账号才离线。`status` 是账号级状态，设为 `invisible` 时所有设备对外都显示离线。

公开头像路径可附加 `?size=32`、`?size=64` 或 `?size=128` 获取等比裁切后的 WebP 缩略图；省略 `size` 时仍返回原文件。缩略图带缓存头，头像文件名变化后客户端应使用资料中的新 URL。

`PATCH /api/v1/presence/connections/{id}` 可只提交 `{"status":"idle"}`；DELETE 会结束该连接。心跳返回 `acknowledged`、`heartbeat_interval`、`expires_in`；删除返回 `removed`。同一账号的富活动状态按所有有效连接合并，好友列表显示最近一次更新的那条活动。

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
| `game.id` | 有 `game` 时必填 | 字符串，最多 128 字符 | 游戏稳定标识；服务端不限定为 `mindustry`。`game.version` 可选，最多 64 字符。 |
| `party.current` / `party.max` | 否 | 0–10000 整数 | 当前人数与队伍上限。 |
| `timestamps.started_at` | 否 | 非负 Unix 秒 | 活动状态开始时间。 |
| `join.session_id` | 否 | 当前用户活跃对端所属会话 ID | 允许好友查看时提供可加入会话；服务端会检查归属。 |

活动状态的 `client_id`、`platform`、`updated_at` 由已认证连接补齐。第三方公开客户端可在获得 `presence.write` 并且站点开启在线状态、富活动开关后调用；活动是否对好友可见由账号的 `activity_visibility` 隐私设置决定。`join.session_id` 必须是该用户当前活跃对端所属的会话，服务端会验证归属。第三方应用的名称、图标、开发者信息来自 MindAuth 客户端公开资料，不能在活动状态请求体中伪造。`DELETE .../{id}/activity` 清除活动状态，响应为 `{"removed":true}`。

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
| `user` | 好友公开资料；隐私策略不允许展示的资料不会借此接口泄漏。`avatar_url` 可为 `null`；绝对 URL 原样使用，以 `/` 开头的站内路径相对于请求所用的 API origin 解析。 |
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
  "visibility": ["private","friends","public"],
  "join_policies": ["invite_only","friends","public"],
  "visibility_join_policy_combinations": ["private+invite_only","private+friends","private+public","friends+invite_only","friends+friends","friends+public","public+invite_only","public+friends","public+public"],
  "require_approval": true,
  "transports": ["udp","tcp","quic","custom"],
  "relay_credential_ttl_seconds": 120,
  "limits": {
    "max_active_sessions_per_user": 1,
    "max_players_per_session": 64,
    "max_pending_invites_per_sender": 50,
    "max_pending_invites_per_session_target": 1,
    "max_presence_connections_per_user": 32,
    "max_lobby_page_size": 50,
    "max_realtime_session_subscriptions": 32
  }
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
  "require_approval":false,
  "max_players":8
}
```

| 请求字段 | 必填 | 类型 / 取值 | 默认或含义 |
|---|---|---|---|
| `game_id` | 是 | 非空字符串，最多 128 字符 | 游戏稳定标识。 |
| `game_version` | 否 | 最多 64 字符 | 客户端/服务器游戏版本。 |
| `activity_name` | 否 | 最多 160 字符 | 好友看到的会话活动文字；缺省使用 `game_id`。 |
| `visibility` | 否 | `private`、`friends`、`public` | 缺省 `private`。只决定谁能在列表中发现房间，不决定能否加入。 |
| `join_policy` | 否 | `invite_only`、`friends`、`public` | 缺省 `friends`。决定谁有资格加入；与 `visibility` 正交，任一组合都合法。 |
| `require_approval` | 否 | 布尔 | 缺省 `false`。为 `true` 时符合加入范围的用户仍需房主批准。 |
| `max_players` | 否 | 2–64 整数 | 缺省 8。 |

创建响应包含 `session`、`peer`、`resume_token`；`join_policy = public` 的会话还包含一次性展示的 `join_code`。立即安全保存 `resume_token`；它绑定用户和 OAuth `client_id`、只能使用一次，断线恢复后会旋转出新令牌。

每个账号最多有一个 `active` 会话。再次创建时返回 HTTP 409 `SESSION_ALREADY_ACTIVE`，`error.details[0].session_id` 指向现有会话；客户端可打开该会话或结束后再建房。重复提交同一 `session_id` 与 `target_user_id` 的邀请时，如果仍有未过期邀请，服务端幂等返回原邀请且不再创建通知。每个发送者最多保留 50 个待处理邀请；超限返回 409 `INVITE_LIMIT_REACHED`，`error.details[0].retry_after_seconds` 表示最早何时可重试。每个 Presence 账号最多 32 条有效连接；这些限制也会出现在 `GET /multiplayer/capabilities.limits`。

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

### 联机大厅

`GET /api/v1/multiplayer/sessions?page=1&limit=20` 返回调用者**可发现**的活跃会话数组。`page` 从 1 起，`limit` 最大 50。可选 `game_id`、`game_version` 以精确匹配筛选游戏；空白值按未指定处理。返回值只包含 `visibility = public` 的会话，以及 `visibility = friends` 且调用者是房主好友或该会话活跃对端的会话；`private` 会话永不出现在该发现列表中。被任一方屏蔽的房主同样不会出现。每个会话对象含 `joinable`（调用者可直接加入）、`blocked_reason`（`null`、`ALREADY_IN_SESSION`、`PRIVACY_DENIED`、`SESSION_NOT_JOINABLE`、`FRIEND_REQUIRED`、`SESSION_FULL` 或 `JOIN_REQUEST_REQUIRED`）和 `can_request_join`（是否可请求审批）。`current_players` 为实时占用人数。

`GET /api/v1/multiplayer/invites?page=1&limit=50` 同样返回邀请数组，默认每页 50、最大 50。两类列表都使用标准 `{data, meta}` 信封，`data` 始终是数组；分页摘要放在 `meta.pagination`（`page`、`limit`、`total`、`total_pages`、`has_more`）。例如：

```json
{
  "data": [{ "id": "ses_AbCdEf0123456789_-wxyz", "joinable": true, "blocked_reason": null }],
  "meta": { "request_id": "req_...", "pagination": { "page": 1, "limit": 20, "total": 1, "total_pages": 1, "has_more": false } }
}
```

当前会话模型没有模组清单字段，因此大厅暂不支持按模组筛选；客户端可按已有的 `game_id` 和 `game_version` 筛选。新增模组筛选前，需要先定义会话如何声明及验证模组标识。

大厅只是发现入口：列表里的每个会话在实际加入时仍会走同一套加入鉴权，`joinable` 是列表生成时的策略快照，加入接口仍会重新鉴权。客户端不得根据列表可见性推断加入权限。

### 解析、加入、退出和恢复

房间码用 `POST /api/v1/multiplayer/sessions/resolve-code` 解析，请求体为 `{"code":"A1B2C3D4E5"}`（10 位十六进制码）。房间码在 `join_policy = public` 时签发，用于定位会话或短期分享，**不代表持有加入权限**：`invite_only` 仍要求有效邀请，`friends` 仍要求好友关系。解析后按 `join_policy` 做最终鉴权。符合加入策略的直接加入可用：

```http
POST /api/v1/multiplayer/sessions/ses_AbCdEf0123456789_-wxyz/join
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{"capabilities":{"transport":["udp","tcp"],"game_version":"v157"}}
```

| 请求体字段 | 是否必填 | 含义 |
|---|---|---|
| `invite_id` | 否 | 通过邀请加入时使用目标用户收到的有效邀请 ID。 |
| `join_code` | 否 | 提交房间码用于定位会话，并满足房主自身的 `allow_join` 隐私设置；不会代替 `join_policy` 判定。 |
| `resume_token` | 否 | 恢复既有对端时提交；若提供则优先执行恢复。成功后旧令牌作废并返回新令牌。 |
| `capabilities` | 否 | 客户端可选能力 JSON；服务端作为该对端信息返回，不会据此授予权限。 |

新加入返回 `{ "peer": ..., "resume_token": "..." }`。即使 join 请求体没有可选字段，也发送 `{}`；恢复时还会有 `resumed: true`。恢复只能在对端的 60 秒恢复窗口内完成；过期对端不可恢复。`POST .../sessions/{id}/leave` 不需要请求体；普通成员返回 `{ "status":"left" }`，房主主动退出返回 `{ "status":"closing","grace_seconds":60 }`。调用 `POST .../sessions/{id}/peers/{peerId}/heartbeat` 续期活跃对端，响应含 `peer_id`、30 秒 `heartbeat_interval` 和 90 秒 `expires_in`。

若 `require_approval = true`，客户端先创建加入请求（`join_policy = invite_only` 不提供请求路径）。请求有效期为 5 分钟；房主批准后，申请者会收到绑定当前 OAuth 客户端的加入意图。申请者使用该意图后即可加入会话；重复使用会在恢复窗口内返回相同结果。处理批准事件时，客户端应先成功使用意图并保存本地事件游标，再发送确认消息；启动器跳转前应由用户确认。

可通过房间码创建直接加入意图；服务端在签发意图时已按 `join_policy` 完成鉴权。意图绑定当前论坛用户，须在 60 秒内首次使用；相同用户和 OAuth 客户端可在 10 分钟恢复窗口内重新取得成功结果。

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

创建邀请的请求体为 `{"session_id":"ses_AbCdEf0123456789_-wxyz","target_user_id":456}`。`session_id` 必须属于当前活跃对端，`target_user_id` 是论坛用户整数 ID；邀请 5 分钟过期。目标用户 GET `/api/v1/multiplayer/invites` 收到的是数组，元素含 `invite_id`、`session_id`、`sender_user_id`、`target_user_id`、`status`、`expires_at` 和会话摘要 `session`。

`POST /api/v1/multiplayer/invites/{id}/accept` 接受邀请后**签发加入意图，不会直接把客户端加入会话**。成功响应的业务数据形状如下，外层仍是标准 `{data, meta}` 信封：

```json
{
  "invite_id": "inv_AbCdEf0123456789_-wxyz",
  "status": "accepted",
  "join_intent": {
    "intent_id": "jnt_AbCdEf0123456789_-wxyz",
    "expires_in": 60
  }
}
```

客户端从 `data.join_intent.intent_id` 读取意图 ID，并调用 `POST /api/v1/multiplayer/join-intents/{intent_id}/consume`。拒绝或撤销不需要请求体，返回更新后的 `status`。重复接受在意图可恢复时返回相同的可用结果。

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

`credential` 是短期秘密，只允许放入 WSS 第一条 AUTH 文本帧，不可放在 URL、查询参数、日志或分析事件里。中继凭证的时效、消费与撤销语义见[生命周期与时效](#生命周期与时效)，端到端接法见[第三方联机接入指南](./multiplayer-guide.md)。

当前分配已由 Agent 确认并处于连接状态时，对端可在凭证到期前再次调用同一个 `POST /api/v1/multiplayer/sessions/{id}/relay` 续期。响应沿用相同的 `allocation_id` 和 Agent，并签发新的短期 `credential`；Agent 需使用原连接身份确认新凭证。若初次分配尚未确认、连接已断开或分配已过期，则不能用此路径续期，需按返回错误重新建立中继分配。

中继 Agent 向论坛边缘提交中继状态时使用的机器接口与 `MULTIPLAYER_RELAY_MACHINE_CREDENTIAL` 凭证属于私有基础设施：它们不面向第三方客户端，不出现在公开 V1 OpenAPI 中，也不能被客户端代码依赖。第三方客户端与中继服务之间的公开契约只有本文件描述的凭证分配与数据通道部分。

### WebSocket 票据

公共实时消息 WebSocket 不能直接把 OAuth 访问令牌放进 URL。先用 `friends.read` 权限范围调用 `POST /api/v1/realtime/tickets`（无请求体）：

```json
{"ticket":"<ONE_TIME_TICKET>","expires_in":60,"websocket_path":"/realtime/v1"}
```

将返回的短期票据作为 `/realtime/v1?ticket=...` 的一次性连接凭证；连接成功后立即失效，60 秒内未使用也会过期。不要记录票据或分享给其他用户。WebSocket 事件流和断线续传格式见下一节。

## WebSocket 实时事件

WebSocket 地址为当前 API 主机上的 `/realtime/v1`。WebSocket 首帧 `hello.heartbeat_interval` 是建议发送间隔（当前 15 秒），不是服务端空闲超时。连接成功后立即发一次 `heartbeat`，此后按建议间隔发送；服务端回复 `heartbeat_ack`。Presence HTTP 心跳是独立机制，仍为 30 秒/90 秒租期。客户端发送：

```json
{"type":"heartbeat"}
{"type":"subscribe","sessions":["ses_AbCdEf0123456789_-wxyz"]}
{"type":"ack","stream":"user","id":"1790758200000-0"}
{"type":"ack","stream":"session","session_id":"ses_AbCdEf0123456789_-wxyz","id":"1790758200000-1"}
{"type":"resume","last_event_id":"1790758200000-0","sessions":{"ses_AbCdEf0123456789_-wxyz":"1790758200000-1"}}
```

服务端支持 `hello`、`heartbeat_ack`、`subscribed`、`event`、`ack`、`error`、`resumed` 和 `resume_failed`。成功连接后会自动关联当前用户事件流；会话事件必须通过 `subscribe` 显式订阅。每条事件包含 `id`、`event`、`timestamp`、`data`。`data` 是供客户端定位变化的轻量通知，不保证携带完整资源；事件流最多保留 600 秒，恢复最多补发 200 条。600 秒是事件保留窗口，不是 WebSocket 连接时长上限。游标已过期或无法恢复时会收到 `resume_failed`（`reason: snapshot_required`），客户端应按事件资源重新读取快照。对端状态以 API 返回的最新会话和对端快照为准。

连接与协议约束：票据校验失败以关闭码 4401 `AUTH_REQUIRED` 拒绝；来源与站点不同源时以 4403 `ORIGIN_DENIED` 拒绝。每个 WebSocket 连接最多同时订阅 32 个会话，调用者必须是每个会话的活跃对端；无权订阅时返回 `SESSION_PERMISSION_DENIED`，超过上限时返回 `SESSION_SUBSCRIPTION_LIMIT_REACHED`，该订阅不会生效。单条客户端消息上限 16 KiB，超过时由协议层关闭连接；无法解析的消息返回 `error` 帧（当前实现为通用 `ACTIVITY_INVALID`）。`hello` 中的 `client_id` 来自票据签发时的已认证客户端，客户端无法在帧内替换。

每个交付的 `event` 帧都保证带非空游标 `id`、事件名 `event`、Unix 毫秒时间戳 `timestamp`、`data` 和来源 stream。`id` 只在对应的 user 或 session stream 中有序；断线恢复时按 stream 分别保存和提交游标。普通事件无需 ACK 才能送达，ACK 不改变 600 秒事件保留窗口。服务端接受 user 与 session stream 的 ACK，但只有 `multiplayer.join_request.approved` 的 user ACK 会确认持久化批准通知；其他 ACK 不改变事件保留、重放或业务状态。客户端应持久化最后处理的游标，并在 `resume` 中提交。对批准事件，客户端先成功消费 `intent_id` 并持久化游标，再 ACK；未 ACK 的批准事件会被重发，客户端可在结果恢复窗口内重复消费同一意图。

事件名：`friend.request.created`、`friend.request.accepted`、`friend.removed`、`presence.updated`、`activity.updated`、`multiplayer.invite.created`、`multiplayer.invite.accepted`、`multiplayer.invite.revoked`、`multiplayer.join_request.created`、`multiplayer.join_request.approved`、`multiplayer.join_request.rejected`、`session.updated`、`session.closed`、`peer.joined`、`peer.updated`、`peer.disconnected`、`peer.left`、`candidate.created`、`candidate.removed`、`relay.allocated`、`relay.revoked`。

每个事件帧中的 `id` 都由服务端生成并保证存在；下表给出各用户流事件的确切 `data` 形状。用户事件不包含完整好友、邀请或 Presence 对象：

| 事件 | `data` JSON 示例 | 获取完整当前状态 |
|---|---|---|
| `friend.request.created` | `{"request_id":42,"requester_user_id":123}` | `GET /api/v1/friends/requests` |
| `friend.request.accepted` | `{"friendship_id":42,"friend_user_id":123}` | `GET /api/v1/friends` |
| `friend.removed` | `{"user_id":123}` | `GET /api/v1/friends` |
| `presence.updated`、`activity.updated` | `{"user_id":123,"status":"online"}`；不会附带完整活动对象 | `GET /api/v1/social/friends/presence` |
| `multiplayer.invite.created` | `{"invite_id":"inv_…","session_id":"ses_…","sender_user_id":123}` | `GET /api/v1/multiplayer/invites` |
| `multiplayer.invite.accepted`、`multiplayer.invite.revoked` | `{"invite_id":"inv_…","session_id":"ses_…"}` | 按需读取邀请或会话快照 |
| `multiplayer.join_request.created` | `{"join_request_id":"jrq_…","session_id":"ses_…","requester_user_id":123}` | `GET /api/v1/multiplayer/join-requests` |
| `multiplayer.join_request.approved` | `{"join_request_id":"jrq_…","session_id":"ses_…","intent_id":"jnt_…"}` | 直接消费 `intent_id`；不需要重新查意图 |
| `multiplayer.join_request.rejected` | `{"join_request_id":"jrq_…","session_id":"ses_…"}` | 重新读取对应会话或请求状态 |
| `session.updated`（房主用户流） | `{"session_id":"ses_…","status":"active"}` | `GET /api/v1/multiplayer/sessions/{id}` |

会话流事件包含定位所需的 `session_id`，对端事件包含 `peer_id`，候选事件包含 `candidate_id`；`candidate.created` 还带候选对象。`session.updated` 包含 `status`，进入关闭宽限期时还带 `grace_seconds`。`relay.allocated` / `relay.revoked` 包含 `session_id`、`peer_id` 和 `allocation_id`。收到会话流的 `resume_failed` 后，按需求读取 `GET /api/v1/multiplayer/sessions/{id}`、`.../peers` 或候选接口。

会话流事件 `data` 的形状如下：

| 事件 | `data` 示例 |
|---|---|
| `session.updated` | `{"session_id":"ses_…","status":"closing","grace_seconds":60}`；正常创建或恢复时 `status` 也可能为 `active` |
| `session.closed` | `{"session_id":"ses_…","status":"closed"}` |
| `peer.joined` | `{"session_id":"ses_…","peer_id":"peer_…","user_id":123}` |
| `peer.updated` | `{"session_id":"ses_…","peer_id":"peer_…","status":"active"}` 或 `status:"expired"` |
| `peer.disconnected`、`peer.left` | `{"session_id":"ses_…","peer_id":"peer_…"}` |
| `candidate.created` | `{"session_id":"ses_…","peer_id":"peer_…","candidate_id":"cnd_…","candidate":{"kind":"public","transport":"udp","address":"203.0.113.10","port":6567}}` |
| `candidate.removed` | `{"session_id":"ses_…","peer_id":"peer_…","candidate_id":"cnd_…"}` |
| `relay.allocated` | `{"session_id":"ses_…","peer_id":"peer_…","allocation_id":"rly_…","agent_id":"official-cn-1"}` |
| `relay.revoked` | `{"session_id":"ses_…","peer_id":"peer_…","allocation_id":"rly_…"}` |

生命周期通知清单是 `session.updated`、`session.closed`、`peer.disconnected`、`peer.left` 和 `peer.updated`（过期时 `status: expired`）。房主退出或断线进入关闭宽限期时收到 `session.updated`；宽限期结束收到 `session.closed`。如果实时通道不可用，客户端仍需读取 API 快照；没有收到事件不表示状态未变化。

`multiplayer.join_request.approved` 发给申请者的原 OAuth 客户端，`data` 包含 `join_request_id`、`session_id` 和可传给启动器的 `intent_id`。批准事件会在处理完成前重发；`intent_id` 在批准后 10 分钟失效。相同用户和客户端在结果恢复窗口内重新使用意图会得到相同结果。客户端只有在成功使用意图后才发送确认消息；崩溃后收到新事件 ID 时，可重复使用意图并恢复结果。

## 功能可用性

多人联机能力按站点配置与应用审核状态动态启用。客户端应先读取 `GET /api/v1/capabilities` 与 `GET /api/v1/multiplayer/capabilities`，并在功能不可用时按稳定错误码提示用户。服务器部署、中继服务注册和运维配置不属于第三方公开 API；Relay Agent 的注册、心跳、分配确认与撤销只由基础设施侧使用，不在公开接口中。

## 限流

限流按「已认证用户 > 会话 > IP」身份粒度、按接口独立计桶；达到上限返回 HTTP 429 `RATE_LIMITED`，并带 `Retry-After`（固定窗口剩余秒数）。未单独声明的读接口默认约 1200/60s，写接口默认约 180/60s。联机与在线状态的更严格限制：

| 接口 | 限制 |
| --- | --- |
| `POST /sessions`、`POST /sessions/{id}/join-requests`、`POST /sessions/{id}/relay` | 10/60s |
| `POST /sessions/{id}/join`、`POST /join-intents/{id}/consume` | 30/60s |
| `POST /invites`、`POST /sessions/{id}/join-intents` | 20/60s |
| `POST /sessions/{id}/candidates`、`GET .../peers/{peerId}/candidates` | 120/60s |
| `POST /presence/connections` | 20/60s |
| `POST /presence/connections/{id}/heartbeat` | 60/60s |
| `PUT /presence/connections/{id}/activity`、`PATCH /social/privacy` | 30/60s |
| `GET /social/friends/presence` | 60/60s |
| `POST /realtime/tickets` | 30/60s |

限额属于站点策略，运行时可能收紧；不要以“上次能通过”推断当前额度。

## 撤销与生效边界

| 事件 | 对新请求 | 对已建立的会话 / 连接 |
| --- | --- | --- |
| MindAuth OAuth 撤销 | 被拒绝；论坛内省缓存 30 秒，最迟约 30 秒内生效 | 不被主动断开；重连与刷新会失败 |
| 账号封禁 | 被拒绝；封禁缓存最长 10 秒 | 不被主动断开，持续到自然结束 |
| 应用能力撤销 | 被拒绝（含会话、邀请、加入、中继与 Presence 创建/活动） | 不被主动中止 |
| 站点开关关闭 | 被拒绝 | 不被主动断开；中继开关关闭时不再分配新凭证，既有凭证到期即止 |

这些时效是当前实现值，用于客户端设计，**不构成 SLA 承诺**。未承诺“撤销即断开”，客户端应自行处理凭证到期与状态快照。

## 隐私与日志边界

不得记录或外泄：访问令牌、刷新令牌、`client_secret`、论坛服务端资源服务器凭据、Relay 凭证、实时票据、Relay Agent 机器凭据、External API Key，以及邮箱、手机号、IP 等用户 PII 明细。候选 `metadata` 与活动文本也不要携带上述内容。排查问题时只保留 HTTP 状态、稳定错误码、`meta.request_id` 与散列后的标识。

## 生命周期与时效

逐项列出签发者、受众、TTL、续期与消费/重放语义。均为当前实现值，客户端据此设计超时；**未承诺 SLA**。

| 对象 | 签发者 | 受众 / 绑定 | TTL | 续期 | 消费 / 重放 |
| --- | --- | --- | --- | --- | --- |
| OAuth 访问令牌 | MindAuth | 不透明令牌，客户端不解析 | 由 MindAuth 决定（[接入指南](./public-client-v1.md)记录约 1 小时） | refresh_token 轮换 | 刷新令牌按轮换语义，不重放旧值 |
| Presence 连接 | 论坛 | 用户 + 客户端 | 90 秒 | 30 秒心跳 | 非一次性；删除即失效 |
| 会话 | 论坛 | 房主账号 | 创建后 4 小时 | 不可续期 | 到期或关闭后不可加入 |
| Peer 恢复令牌 | 论坛 | 用户 + OAuth 客户端 + 对端 | 随会话 | 每次恢复轮换 | 单次消费；旧令牌作废 |
| 邀请 | 论坛 | 目标用户 | 5 分钟 | 不可续期 | 接受一次；重复接受按可恢复语义返回 |
| 加入请求 | 论坛 | 房主 | 5 分钟 | 不可续期 | 批准一次；批准后意图 10 分钟 |
| 加入意图 | 论坛 | 用户（批准类另绑定 OAuth 客户端） | 首次使用 60 秒 | 不可续期 | 单次消费；恢复窗口内重放返回同结果 |
| 网络候选 | 客户端（论坛存储） | 同会话对端 | 90 秒 | 重复发布续期 | 非一次性；可删除 |
| Relay 分配与凭证 | 论坛 | 指定 Relay Agent + 对端 | 120 秒 | 已连接可续期（同一连接身份） | Agent 单次消费；同连接重试允许 |
| 实时票据 | 论坛 | 用户 + 客户端 | 60 秒 | 不可续期 | 单次消费；连接即失效 |
| 实时事件流 | 论坛 | 会话对端 / 用户 | 保留 600 秒 | 不可续期 | 恢复最多补发 200 条 |

Relay 凭证是 HMAC 签名的短期串，绑定 `relay_session_id`、`session_id`、`peer_id`、`agent_id` 与到期时间；它只对签发的那个 Agent 与该分配有效。**未承诺**固定网络路径、区域选择、时延指标或 Agent 侧 TCP/WSS 物理断开的时刻，这些属于基础设施边界。

## 错误码

稳定的业务错误码包括 `AUTH_REQUIRED`、`TOKEN_INVALID`、`TOKEN_EXPIRED`、`SCOPE_REQUIRED`/`INSUFFICIENT_SCOPE`、`USER_BLOCKED`、`FRIEND_REQUIRED`、`PRIVACY_DENIED`、`FEATURE_DISABLED`、`PRESENCE_CONNECTION_NOT_FOUND`、`PRESENCE_CONNECTION_LIMIT_REACHED`、`ACTIVITY_INVALID`、`SESSION_NOT_FOUND`、`SESSION_EXPIRED`、`SESSION_CLOSED`、`SESSION_ALREADY_ACTIVE`、`SESSION_FULL`、`SESSION_NOT_JOINABLE`、`SESSION_PERMISSION_DENIED`、`PEER_NOT_FOUND`、`PEER_EXPIRED`、`PEER_RESUME_INVALID`、`CANDIDATE_INVALID`、`CANDIDATE_LIMIT_REACHED`、`INVITE_NOT_FOUND`、`INVITE_LIMIT_REACHED`、`INVITE_EXPIRED`、`INVITE_ALREADY_ACCEPTED`、`JOIN_REQUEST_REQUIRED`、`JOIN_REQUEST_EXPIRED`、`JOIN_INTENT_INVALID`、`JOIN_INTENT_CLIENT_MISMATCH`、`JOIN_INTENT_EXPIRED`、`JOIN_INTENT_CONSUMED`、`JOIN_INTENT_RECOVERY_EXPIRED`、`JOIN_INTENT_RECOVERY_UNAVAILABLE`、`RELAY_UNAVAILABLE`、`RELAY_LIMIT_REACHED`、`RATE_LIMITED`。

客户端依据 `error.code` 和 HTTP 状态处理错误，不依赖提示文字。主要码的语义：

| code | HTTP | 可重试 | 幂等 / 重试纪律 |
| --- | --- | --- | --- |
| `INVALID_TOKEN` | 401 | 否 | 刷新或重新授权后再试 |
| `INSUFFICIENT_SCOPE` | 403 | 否 | 用户重新授权补 scope |
| `CLIENT_CAPABILITY_NOT_APPROVED` | 403 | 否 | 等待或修订应用审核状态 |
| `FEATURE_DISABLED` | 403 | 否 | 站点未开放，隐藏入口 |
| `SESSION_CLOSED` / `SESSION_EXPIRED` | 404 | 否 | 终态业务响应；结束本地会话状态，不要重试该会话 |
| `SESSION_ALREADY_ACTIVE` | 409 | 否 | `error.details[0].session_id` 指向账号已有会话 |
| `INVITE_LIMIT_REACHED` / `PRESENCE_CONNECTION_LIMIT_REACHED` | 409 | 否 | 先等待邀请过期或关闭已有 Presence 连接 |
| `SESSION_FULL` | 409 | 否 | 换会话或稍后重试 |
| `SESSION_NOT_JOINABLE` / `JOIN_REQUEST_REQUIRED` | 400 / 409 | 否 | 换加入路径（邀请或审批） |
| `PEER_RESUME_INVALID` | 403 | 否 | 恢复令牌单次消费，不得重放 |
| `CANDIDATE_LIMIT_REACHED` | 429 | 是 | 已有上限内的候选，不必重复发布 |
| `JOIN_INTENT_CONSUMED` | 409 | 否 | 仅恢复窗口内存活时重试才有意义 |
| `JOIN_INTENT_RECOVERY_EXPIRED` | 410 | 否 | 重新走邀请 / 批准流程 |
| `JOIN_INTENT_RECOVERY_UNAVAILABLE` | 503 | 是 | 指数退避 |
| `RELAY_UNAVAILABLE` / `RELAY_LIMIT_REACHED` | 503 / 429 | 是 | 指数退避；已连接时沿用同一连接身份续期 |
| `RATE_LIMITED` | 429 | 是 | 至少等待 `Retry-After` |

个别路由可能在该码的注册状态之外返回 404（例如删除不存在的候选返回 404 `CANDIDATE_INVALID`）。控制流按 `error.code`，状态码只作辅助判断。

如果客户端没有收到 HTTP 响应（例如 DNS、TLS、连接重置或超时），这属于传输层失败；不会有 `{error, meta}`、业务 `error.code` 或服务端 `request_id`。有 HTTP 响应时才按 V1 信封、HTTP 状态和 `error.retryable` 分流。传输失败的写请求结果可能未知：对幂等邀请可安全重试；建房重试若收到 `SESSION_ALREADY_ACTIVE`，应读取 details 中的现有 `session_id`。

## 客户端恢复

实时消息事件用于低延迟更新界面，不应取代 API 快照。断线或收到 `resume_failed` 后重新读取当前会话、好友和对端状态；对可重试的请求，按错误码、状态码和 `request_id` 处理。已消费的一次性凭据不因网络重试而恢复发放：按各资源的恢复语义处理，或回到快照重新建立状态。

