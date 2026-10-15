# MessagesV1Controller_unreadCount

> GET /api/v1/messages/unread-count · 契约：openapi-public-v1.json

读取未读私信数

需要有效且未封禁的账号；OAuth Bearer 需要 message.read。每个账号每分钟最多 60 次。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`message.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/messages/unread-count`

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 当前账号的未读消息数量。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1MessagesUnreadCountGetResponse

```json
{
  "count": 0
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/messages/unread-count" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
