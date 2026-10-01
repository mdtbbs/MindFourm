# 论坛 API V1 参考

本页按功能介绍论坛公开 API，并说明认证要求、请求参数、分页方式和常见写入操作。第三方客户端的授权流程与 scope 配置见[客户端接入指南](./public-client-v1.md)。

Base URL:

```text
/api/v1
```

建议按以下顺序接入：

1. 用 MindAuth Public Client + Authorization Code + PKCE S256 登录，获取 Bearer token。
2. `GET /api/v1/capabilities`
3. 根据客户端类型读取 `GET /api/v1/client/config`
4. 调用业务 API；具体操作仍受本地权限、手机验证、封禁和站点设置限制。

完整参数定义见 `/api/openapi/v1.json`。本页侧重说明各组接口的用途和认证要求。

## 服务能力与客户端配置

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/capabilities` | 公开 | 能力发现；包含 `multiplayer` 功能开关和 `cloud_saves_v1` |
| GET | `/api/v1/client/config` | 公开 | Android 等客户端版本和功能配置 |

## 移动端会话

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/mobile/exchange` | 公开 | MindAuth native code 换 Forum mobile token |
| POST | `/api/v1/auth/mobile/refresh` | 刷新令牌 | 轮换 access/refresh token |
| POST | `/api/v1/auth/mobile/logout` | Forum Bearer / 会话 | 注销指定设备会话 |
| GET | `/api/v1/auth/mobile/sessions` | Forum Bearer / 会话 | 查看当前用户设备会话 |
| DELETE | `/api/v1/auth/mobile/sessions/{id}` | Forum Bearer / 会话 | 撤销设备会话 |

认证细节见 [authentication.md](./authentication.md)。

## 用户资料

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/me` | 需要登录 | 当前用户稳定资料 |
| PUT | `/api/v1/me/profile` | 需要登录 | 更新本人资料 |
| POST | `/api/v1/me/avatar` | 需要登录 | 上传本人头像 |
| GET | `/api/v1/users/{id}` | 公开 | 用户公开资料 |
| GET | `/api/v1/me/bookmarks` | 需要登录 | 当前用户书签 |

写请求还受手机号验证和封禁状态检查影响。

## 讨论与回复

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/threads` | 公开 | 讨论列表 |
| GET | `/api/v1/threads?q=关键词` | 公开 | 使用论坛现有搜索服务 |
| POST | `/api/v1/threads` | 需要登录 | 创建讨论 |
| GET | `/api/v1/threads/{id}` | 可匿名访问 | 讨论详情；匿名可读，登录后附加 viewer / ownership 状态 |
| PUT | `/api/v1/threads/{id}` | 需要登录 | 修改讨论 |
| DELETE | `/api/v1/threads/{id}` | 需要登录 | 软删除讨论 |
| PUT | `/api/v1/threads/{id}/like` | 需要登录 | 点赞，幂等 |
| DELETE | `/api/v1/threads/{id}/like` | 需要登录 | 取消点赞，幂等 |
| PUT | `/api/v1/threads/{id}/bookmark` | 需要登录 | 收藏，幂等 |
| DELETE | `/api/v1/threads/{id}/bookmark` | 需要登录 | 取消收藏，幂等 |
| POST | `/api/v1/threads/{id}/replies` | 需要登录 | 回复讨论 |
| GET | `/api/v1/threads/{id}/replies?page=1&limit=20` | 可匿名访问 | 独立分页读取回复；详情内回复仍保留 |
| PUT | `/api/v1/threads/{threadId}/replies/{replyId}` | 需要登录 | 修改回复 |
| DELETE | `/api/v1/threads/{threadId}/replies/{replyId}` | 需要登录 | 软删除回复 |

### 讨论列表参数与分页

普通列表与标题、正文搜索支持 `limit`、`offset`、`page` 和 `category_id`：

```http
GET /api/v1/threads?limit=20&offset=0&category_id=2
```

| 参数 | 类型 | 含义 |
| --- | --- | --- |
| `limit` | integer | 每页条数，默认 20，最大 50。 |
| `offset` | integer | 从列表开头跳过的条数，默认 0。 |
| `page` | integer | 页码，从 1 开始；未传 `offset` 时用 `(page - 1) × limit` 计算起点。 |
| `category_id` | integer | 只返回指定论坛分类的讨论。 |
| `q` | string | 搜索标题与正文；搜索使用 `page` 和 `limit` 分页。 |
| `sort` | string | `q` 搜索支持 `relevance`、`newest`、`oldest`。 |

搜索例子：

```http
GET /api/v1/threads?q=建筑&page=1&limit=20
```

普通列表的 `data` 是讨论摘要数组，分页信息位于顶层 `meta.pagination`：

```json
{
  "data": [{
    "public_id": null,
    "id": 123,
    "title": "新手建筑布局分享",
    "slug": "xin-shou-jian-zhu",
    "status": "published",
    "is_pinned": false,
    "is_locked": false,
    "view_count": 245,
    "reply_count": 8,
    "created_at": "2026-09-30T12:00:00.000Z",
    "updated_at": "2026-09-30T12:30:00.000Z",
    "category_id": 2,
    "user_id": 45,
    "author": { "id": 45, "username": "builder", "avatar_url": null },
    "category": { "id": 2, "name": "交流", "slug": "discussion" },
    "excerpt": "分享一套适合新手的建筑布局……"
  }],
  "meta": {
    "request_id": "req_example",
    "pagination": { "page": 1, "limit": 20, "total": 42, "total_pages": 3, "has_more": true }
  }
}
```

`public_id` 当前为 `null`；客户端暂时用 `id` 访问讨论。摘要字段说明：`status` 是发布状态；`is_pinned` / `is_locked` 分别表示置顶和锁定；`view_count` / `reply_count` 是浏览与回复数；`author`、`category` 是可为空的嵌套摘要；`excerpt` 是纯文本预览。时间使用 ISO 8601。

cursor 模式与 offset/search 模式分开使用。首次读取可发送空 `cursor` 来选择 cursor 模式，之后把 `data.next_cursor` 原样用于下一页：

```http
GET /api/v1/threads?limit=20&cursor=
GET /api/v1/threads?limit=20&cursor=CURSOR_FROM_PREVIOUS_RESPONSE
```

cursor 列表可选参数为 `source`、`exclude_category_ids`（逗号分隔）、`user_id`、`content_language`、`server_id`、`sort` 和 `order`。`sort` 支持 `created_at`、`updated_at`、`view_count`、`like_count`；`order` 是 `ASC` 或 `DESC`。cursor 响应的 `data` 是 `{ items, next_cursor, has_more }`，游标不透明，客户端不要解码或自行拼接。

### 创建讨论与回复

写接口使用已授权的 MindAuth Bearer token 和 `forum.write` scope。以下示例以 富文本格式 V2 提交正文：

```http
POST /api/v1/threads
Authorization: Bearer <MIND_AUTH_ACCESS_TOKEN>
Content-Type: application/json

{
  "title": "新手建筑布局分享",
  "category_id": 2,
  "post_type": "normal",
  "content_schema_version": 2,
  "content_json": {
    "type": "doc",
    "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "分享一套适合新手的建筑布局。" }] }]
  },
  "tags": ["建筑"],
  "status": "published"
}
```

`title` 必填。`category_id`、`server_id`、`required_group_id`、`post_type`、`content_language`、`tags` 和 `status` 可选；`post_type` 省略时为 `normal`，其他值应来自站点当前配置的帖子前缀。`content_language` 省略时服务端保存为 `unknown`。`status` 只能请求 `draft` 或 `published`；请求 `published` 不代表绕过审核，服务端可能保存为 `pending`。新客户端发送 `content_json` 时同时发送 `content_schema_version: 2`；`content` 是兼容用 Markdown 正文。字段限制和完整 Tiptap node / mark 选项见 [富文本格式](./rich-content-schema-v2.md)。

```http
POST /api/v1/threads/123/replies
Authorization: Bearer <MIND_AUTH_ACCESS_TOKEN>
Content-Type: application/json

{
  "content_schema_version": 2,
  "content_json": {
    "type": "doc",
    "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "可以试试把电力区放在地图中央。" }] }]
  },
  "parent_reply_id": null
}
```

`parent_reply_id` 省略或为 `null` 表示直接回复讨论；填同一讨论下的回复 ID 则表示回复该回复。创建成功返回 HTTP 201，响应里的 `status` 以服务端审核结果为准。

### 读取讨论详情与回复

```http
GET /api/v1/threads/123
GET /api/v1/threads/123/replies?page=1&limit=20
```

详情的 `data` 在摘要字段外还包括：`content`（纯文本兼容正文）、`content_format`（当前为 `tiptap_json`）、`content_json`（规范正文）、`content_html`（服务端生成的安全 HTML）、`content_text`（搜索/纯文本投影）、`content_schema_version`、`post_type`、`best_reply_id`、`edited_at`、`like_count`、分类与作者扩展字段、`prefix`、`tags`、`viewer`、`is_owner`、`replies` 和 `reply_pagination`。匿名读取时 `viewer` 为 `null`；登录后其中的 `liked` 与 `bookmarked` 表示当前账号状态。

回复列表的 `data` 是回复数组，每项包含 `id`、`post_id`、`user_id`、`parent_reply_id`、正文的四种表示、`status`、`like_count`、创建/更新时间、作者字段、`location_label` 和 `is_owner`。翻页信息在 `meta.pagination`，其中 `page`、`limit`、`total`、`total_pages`、`has_more` 表示当前页、页大小、总条数、总页数和是否还有下一页。独立回复接口每页最多 50 条；详情内只附带首批回复。

thread/reply 读写支持 Tiptap JSON、服务端安全 HTML 与纯文本投影；`content` Markdown 字段继续用于兼容。

## 资源中心

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/resources` | 公开 | 资源列表 |
| GET | `/api/v1/resources/{id}` | 公开 | 资源详情 |
| GET | `/api/v1/resources/{id}/manifest` | 公开 | 安装和同步清单 |
| GET | `/api/v1/resources/{id}/preview` | 需要登录 | 资源预览 |
| GET | `/api/v1/resources/{resourceId}/versions/{versionId}/files/{fileId}/download` | 需要登录 | 版本文件下载 |
| POST | `/api/v1/resources/drafts` | `resource.upload` | 上传隔离区草稿 |
| POST | `/api/v1/resources/drafts/preview` | `resource.upload` | 地图/蓝图解析并生成私有预览草稿 |
| GET | `/api/v1/resources/drafts/{draftId}` | `resource.upload` | 读取本人草稿 |
| PATCH | `/api/v1/resources/drafts/{draftId}` | `resource.upload` | 更新草稿元数据 |
| POST | `/api/v1/resources/drafts/{draftId}/submit` | `resource.upload` | 送入既有资源审核流程 |
| DELETE | `/api/v1/resources/drafts/{draftId}` | `resource.upload` | 删除本人草稿 |

资源 API 仍受 `resource_read` 服务能力和站点功能开关控制。文件可以匿名下载；携带 OAuth Bearer 时，令牌必须具备 `resource.download`。上传草稿仅创建者可读，30 分钟后过期，提交后进入现有审核流程。资源标识、Manifest 和文件安全规则见[资源中心 API V1 契约](./resources-v1-contract.md)和[客户端接入指南](./public-client-v1.md)。

## 游戏内容

游戏内容 API 专门提供蓝图和地图相关操作，入口为：

```text
/api/v1/game-content
```

它覆盖：

- 蓝图/地图浏览
- 搜索与标签
- 内容动态
- 预览
- 蓝图代码复制
- 地图下载
- 点赞和收藏
- 蓝图直接提交
- 地图 multipart 上传、预览、完成提交
- 我的资源和收藏

完整 endpoint 表、请求参数、限流和上传流程见 [game-content-v1.md](./game-content-v1.md)。

## 好友、在线状态与多人联机

好友、在线状态和联机使用 MindAuth Public Client Bearer。Scope 按操作类别申请：好友接口用 `friends.read`，Presence 用 `presence.read` / `presence.write`，联机控制面用 `multiplayer.read` / `multiplayer.write`。第三方联机还受站点开关及应用的 Presence / Multiplayer / Join Intent 能力审核约束。

| 方法 | 路径 | OAuth scope | 说明 |
| --- | --- | --- | --- |
| GET / PATCH | `/api/v1/social/privacy` | `presence.read` / `presence.write` | 读取或更新好友、Presence 与联机隐私策略 |
| GET | `/api/v1/social/friends/presence?page=1&limit=50` | `friends.read presence.read` | 分页好友、在线状态与 Activity 聚合 |
| GET | `/api/v1/friends`、`/api/v1/friends/requests` | `friends.read` | 好友列表与待处理请求 |
| POST | `/api/v1/friends/requests` | `friends.read` | 发送好友请求 |
| POST | `/api/v1/friends/requests/{id}/accept`、`.../reject` | `friends.read` | 接受或拒绝好友请求 |
| DELETE | `/api/v1/friends/{userId}` | `friends.read` | 删除好友 |
| GET | `/api/v1/blocks` | `friends.read` | 查看屏蔽列表 |
| POST / DELETE | `/api/v1/users/{id}/block` | `friends.read` | 屏蔽或解除屏蔽用户 |
| POST | `/api/v1/presence/connections` | `presence.write` | 创建 Presence Connection |
| PATCH / DELETE | `/api/v1/presence/connections/{id}` | `presence.write` | 更新或删除 Presence Connection |
| POST | `/api/v1/presence/connections/{id}/heartbeat` | `presence.write` | Presence 心跳 |
| PUT / DELETE | `/api/v1/presence/connections/{id}/activity` | `presence.write` | 发布或清除 Rich Activity |
| GET / PATCH | `/api/v1/multiplayer/preferences` | `multiplayer.read` / `multiplayer.write` | 查看或更新默认 Join Intent 客户端 |
| GET | `/api/v1/multiplayer/capabilities` | `multiplayer.read` | 读取联机能力和限制 |
| POST | `/api/v1/multiplayer/sessions` | `multiplayer.write` | 创建 Session |
| GET | `/api/v1/multiplayer/sessions/{id}`、`.../{id}/peers` | `multiplayer.read` | 读取可见 Session 与 Peer |
| POST | `/api/v1/multiplayer/sessions/resolve-code` | `multiplayer.read` | 解析 Unlisted Session 加入码 |
| POST | `/api/v1/multiplayer/sessions/{id}/join`、`.../leave` | `multiplayer.write` | 加入、退出或恢复 Peer |
| POST | `/api/v1/multiplayer/sessions/{id}/peers/{peerId}/heartbeat` | `multiplayer.write` | Peer 心跳 |
| POST | `/api/v1/multiplayer/sessions/{id}/candidates` | `multiplayer.write` | 发布连接候选 |
| GET | `/api/v1/multiplayer/sessions/{id}/peers/{peerId}/candidates` | `multiplayer.read` | 读取 Peer 的连接候选 |
| DELETE | `/api/v1/multiplayer/sessions/{id}/candidates/{candidateId}` | `multiplayer.write` | 删除连接候选 |
| POST | `/api/v1/multiplayer/invites` | `multiplayer.write` | 创建联机邀请 |
| GET | `/api/v1/multiplayer/invites` | `multiplayer.read` | 查看自己的联机邀请 |
| POST | `/api/v1/multiplayer/invites/{id}/accept`、`.../decline`、`.../revoke` | `multiplayer.write` | 接受、拒绝或撤销邀请 |
| POST | `/api/v1/multiplayer/sessions/{id}/join-requests` | `multiplayer.write` | 请求加入需要审批的 Session |
| POST | `/api/v1/multiplayer/join-requests/{id}/approve`、`.../reject` | `multiplayer.write` | 批准或拒绝加入请求 |
| POST | `/api/v1/multiplayer/sessions/{id}/join-intents` | `multiplayer.write` | 创建短期、一次性的 Join Intent |
| POST | `/api/v1/multiplayer/join-intents/{id}/consume` | `multiplayer.write` | Launcher 消费 Join Intent 并加入 Session |
| POST | `/api/v1/multiplayer/sessions/{id}/relay` | `multiplayer.write` | 为当前 Peer 申请短期官方 Relay Credential |
| POST | `/api/v1/realtime/tickets` | `friends.read` | 创建一次性 WebSocket ticket |

Session 的可见性、加入策略、恢复凭证和 Relay/WebSocket 协议都有额外约束。逐接口请求体、字段、错误码及联机流程见 [多人联机 API](./multiplayer-v1.md)。

## 云存档

云存档是用户私有数据，不进入公共资源中心。API 入口是 `/api/v1/game-saves`；只申请客户端实际需要的 `game_content.saves.read`、`game_content.saves.write` 和 `game_content.saves.delete`。服务端按当前用户校验 Slot 所有权，不能通过传入其他用户 ID 读取他人存档。

| 方法 | 路径 | OAuth scope | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/capabilities` | 公开 | 检查 `cloud_saves_v1` 能力是否启用 |
| GET | `/api/v1/game-saves?limit=20&cursor=...` | `game_content.saves.read` | 游标分页列出自己的存档 Slot |
| GET | `/api/v1/game-saves/quota` | `game_content.saves.read` | 查看存储额度与限制 |
| POST | `/api/v1/game-saves` | `game_content.saves.write` | 创建 Slot |
| GET | `/api/v1/game-saves/{slotId}` | `game_content.saves.read` | 查看 Slot 与当前 Snapshot |
| PATCH | `/api/v1/game-saves/{slotId}` | `game_content.saves.write` | 更新 Slot 元数据 |
| DELETE | `/api/v1/game-saves/{slotId}` | `game_content.saves.delete` | 删除自己的 Slot |
| GET | `/api/v1/game-saves/{slotId}/snapshots` | `game_content.saves.read` | 查看历史 Snapshot |
| PATCH | `/api/v1/game-saves/{slotId}/snapshots/{snapshotId}` | `game_content.saves.write` | Pin / Unpin 历史版本 |
| DELETE | `/api/v1/game-saves/{slotId}/snapshots/{snapshotId}` | `game_content.saves.delete` | 删除允许删除的历史版本 |
| POST | `/api/v1/game-saves/{slotId}/snapshots/{snapshotId}/restore` | `game_content.saves.write` | 将历史内容恢复为新 Snapshot |
| POST | `/api/v1/game-saves/{slotId}/uploads` | `game_content.saves.write` | 创建上传会话并取得论坛文件上传地址 |
| PUT | `/api/v1/game-saves/uploads/{uploadId}/file` | `game_content.saves.write` | 将存档文件流上传到论坛本地存储 |
| POST | `/api/v1/game-saves/uploads/{uploadId}/commit` | `game_content.saves.write` | 校验上传对象并提交 Snapshot |
| DELETE | `/api/v1/game-saves/uploads/{uploadId}` | `game_content.saves.write` | 取消未提交的上传会话 |
| POST | `/api/v1/game-saves/{slotId}/snapshots/{snapshotId}/download` | `game_content.saves.read` | 获取需继续认证的私有下载地址 |
| GET | `/api/v1/game-saves/{slotId}/snapshots/{snapshotId}/file` | `game_content.saves.read` | 从论坛本地存储下载存档文件 |

文件通过 Forum API 流式传输；后台管理员可配置本地持久化目录、每用户额度和单文件大小。完整请求流程与磁盘部署要求见[云存档 API](./cloud-saves-v1.md)。

上传和下载的文件字节由客户端直接传到对象存储，不经过论坛 API；签名 URL 和云存档响应为私有数据，不应缓存。分页、配额、幂等、上传/恢复示例和完整字段说明见 [云存档 API](./cloud-saves-v1.md)。

## 通知与私信

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/notifications` | 需要登录 | `notification.read` scope；分页通知 |
| GET | `/api/v1/notifications/unread-count` | 需要登录 | `notification.read` scope |
| PUT | `/api/v1/notifications/{id}/read` | 需要登录 | `notification.read` scope |
| PUT | `/api/v1/notifications/read-all` | 需要登录 | `notification.read` scope |
| GET | `/api/v1/messages` | 需要登录 | `message.read` scope；会话 cursor 分页 |
| GET | `/api/v1/messages/unread-count` | 需要登录 | `message.read` scope |
| GET | `/api/v1/messages/{userId}` | 需要登录 | `message.read` scope；对话 cursor 分页 |
| POST | `/api/v1/messages` | 需要登录 | `message.write` scope；复用既有 block/通知策略 |

通知受 `feature_notifications_v1_enabled` 控制。私信受 `feature_messages_enabled` 控制，第三方 OAuth 私信还需管理员开启 `feature_messages_third_party_access_enabled`；缺少设置时返回稳定 403 code。

## 发现页与首页聚合

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/discover` | 公开 | 发现页聚合 |
| GET | `/api/v1/home` | 公开 | 第一方首页数据 |
| GET | `/api/v1/portal` | 公开 | Portal 聚合数据 |
| GET | `/api/v1/lanlink/rooms` | 公开 | LanLink 公共房间列表 |

`/api/external/v1/lanlink/quick-code/*` 属于 External API，不属于这个公共 V1 面。

## 公告

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/notices` | 公开 | 已发布公告列表 |
| GET | `/api/v1/notices/{id}` | 公开 | 公告详情 |
| GET | `/api/v1/admin/notices` | 管理员 | 管理公告 |
| POST | `/api/v1/admin/notices` | 管理员 | 创建公告 |
| PATCH | `/api/v1/admin/notices/{id}` | 管理员 | 更新公告 |
| DELETE | `/api/v1/admin/notices/{id}` | 管理员 | 删除公告 |

## 反馈、举报与图片上传

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/v1/feedback` | 需要登录 | 提交反馈 |
| POST | `/api/v1/reports` | 需要登录 | 创建举报 |
| GET | `/api/v1/reports/mine` | 需要登录 | 查看自己的举报 |
| POST | `/api/v1/uploads/images` | 需要登录 | 上传正文图片 |

Public Client OAuth、scope 名称、富文本字段以及 cURL、JavaScript、Java、Kotlin 调用示例见[客户端接入指南](./public-client-v1.md)。

## 不属于公开论坛 API 的接口

下列路径可能真实存在，但不要因为它们能调用就视为 V1：

```text
/api/resources/*
/api/posts/*
/api/replies/*
/api/service-api/*
/api/external/v1/*
/api/admin/*
```

这些路由有的是 legacy Web API，有的是机器人/后台/服务间接口。对外客户端需要新能力时，优先新增 `/api/v1/*` 契约，不要把内部路由直接暴露成“文档”。
