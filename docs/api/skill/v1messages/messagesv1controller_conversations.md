# MessagesV1Controller_conversations

> GET /api/v1/messages · 契约：openapi-public-v1.json

列出私信会话

需要有效且未封禁的账号；OAuth Bearer 需要 message.read。若对方已屏蔽当前账号，不会泄露其会话摘要。每个账号每分钟最多 60 次。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`message.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/messages`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `cursor` | 字符串 | 否 | 上一页 data.next_cursor 返回的不透明游标 |
| `limit` | 数字 | 否 | 每页会话数量，默认 50；最小 1；最大 100 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 会话摘要游标分页；next_cursor 位于 data 中。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1MessagesGetResponse

```json
{
  "has_more": false, // 是否还有下一页。
  "items": [{
    "avatar_url": "string", // 会话对方头像 URL。
    "last_at": "string", // 最近一条消息时间。
    "last_content": "string", // 最近一条消息正文。
    "unread_count": 0, // 未读消息数。
    "user_id": 0, // 会话对方的论坛用户 ID。
    "username": "string" // 会话对方用户名。
  }], // 会话摘要。
  "next_cursor": "string" // 下一页游标；复制到下次请求的 cursor 参数。
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/messages?cursor=<cursor>&limit=<limit>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
