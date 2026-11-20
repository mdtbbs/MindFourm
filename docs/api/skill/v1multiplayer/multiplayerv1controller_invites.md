# MultiplayerV1Controller_invites

> GET /api/v1/multiplayer/invites · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`multiplayer.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/multiplayer/invites`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | 数字 | 否 | 页码，从 1 开始；最小 1 |
| `limit` | 数字 | 否 | 每页邀请数，最大 50；最小 1；最大 50 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 标准成功信封；data 是数组，分页摘要位于 meta.pagination。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1MultiplayerInvitesGetResponse

```json
{
  "data": [{
    "expires_at": "string",
    "invite_id": "string",
    "sender_user_id": 0,
    "session": {},
    "session_id": "string",
    "status": "string",
    "target_user_id": 0
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
  "$FORUM_BASE_URL/api/v1/multiplayer/invites?page=<page>&limit=<limit>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
