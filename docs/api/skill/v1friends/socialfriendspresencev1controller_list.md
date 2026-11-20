# SocialFriendsPresenceV1Controller_list

> GET /api/v1/social/friends/presence · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`friends.read`、`presence.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/social/friends/presence`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | 数字 | 否 | 每页好友数，最大 50；最小 1；最大 50 |
| `page` | 数字 | 否 | 好友列表页码，从 1 开始；最小 1 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 成功响应使用标准 {data, meta} 信封；本 schema 描述 data 中的分页业务对象，标准分页摘要同时位于 meta.pagination。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1SocialFriendsPresenceGetResponse

```json
{
  "data": [{
    "actions": {
      "can_invite": false,
      "can_join": false,
      "can_request_join": false,
      "invite_session_id": "string",
      "session_visible": false
    },
    "activity": {}, // 当前可见的富活动状态；不可见或无活动时为 null。
    "presence": {
      "last_seen_at": 0, // 允许展示时提供的 Unix 秒时间戳。
      "status": "string"
    },
    "user": {
      "avatar_url": "string", // 头像引用。绝对 URL 可直接使用；以 / 开头的站内路径须相对于请求所用的 API origin 解析。无头像时为 null。
      "id": 0,
      "username": "string"
    }
  }],
  "pagination": {
    "limit": 0,
    "page": 0,
    "total": 0,
    "totalPages": 0
  }
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/social/friends/presence?limit=<limit>&page=<page>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
