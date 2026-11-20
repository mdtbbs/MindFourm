# MultiplayerV1Controller_listSessions

> GET /api/v1/multiplayer/sessions · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`multiplayer.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/multiplayer/sessions`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `game_id` | 字符串 | 否 | 按游戏稳定 ID 精确筛选；最长 128 |
| `game_version` | 字符串 | 否 | 按游戏版本精确筛选；最长 64 |
| `modded` | 布尔值 | 否 | 按是否模组房筛选：true 只返回模组房，false 只返回原版房 |
| `mod_id` | 字符串 | 否 | 只返回房主清单包含该 Mod 的会话；最长 191 |
| `pack_public_id` | 字符串 | 否 | 只返回引用该公开 Pack 的会话；最长 36 |
| `page` | 数字 | 否 | 页码，从 1 开始；最小 1 |
| `limit` | 数字 | 否 | 每页数量，最大 50；最小 1；最大 50 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 标准成功信封；data 是数组，分页摘要位于 meta.pagination。每项包含调用者可发现的会话与加入判定。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1MultiplayerSessionsGetResponse

```json
{
  "data": [{
    "activity_name": "string",
    "blocked_reason": "string", // 不能直接加入时的稳定原因码。
    "can_request_join": false, // 是否可改为请求房主批准。
    "current_players": 0,
    "expires_at": "string",
    "game": {},
    "id": "string",
    "is_modded": false, // 是否为模组房。
    "join_policy": "string",
    "joinable": false, // 当前调用者能否直接加入。
    "max_players": 0,
    "mod_count": 0, // 房主上报的 Mod 数量。
    "mod_summary": {}, // 大厅摘要；mods 最多前 8 项，完整清单读取单会话。
    "mod_syncable_count": 0, // 服务端可校验并自动下发授权的 Mod 数量。
    "owner_user_id": 0,
    "require_approval": false,
    "status": "string",
    "visibility": "string"
  }],
  "meta": {
    "pagination": {
      "has_more": false,
      "limit": 0,
      "page": 0,
      "total": 0,
      "total_pages": 0
    },
    "request_id": "string"
  }
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/multiplayer/sessions?game_id=<game_id>&game_version=<game_version>&modded=<modded>&mod_id=<mod_id>&pack_public_id=<pack_public_id>&page=<page>&limit=<limit>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
