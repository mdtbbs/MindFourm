# MessagesV1Controller_conversation

> GET /api/v1/messages/{userId} · 契约：openapi-public-v1.json

读取私信会话

需要有效且未封禁的账号；OAuth Bearer 需要 message.read。若对方已屏蔽当前账号，则拒绝读取。每个账号每分钟最多 60 次。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`message.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/messages/{userId}`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `userId` | 数字 | 是 | - |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `cursor` | 字符串 | 否 | 上一页 data.next_cursor 返回的不透明游标 |
| `limit` | 数字 | 否 | 每页消息数量，默认 50；最小 1；最大 100 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 消息游标分页，按时间正序返回；读取时会将收到的消息标为已读，next_cursor 位于 data 中。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1MessagesUserIdGetResponse

```json
{
  "has_more": false, // 是否还有下一页。
  "items": [{
    "content": "string", // 消息纯文本。
    "content_html": "string", // 服务端生成的安全 HTML。
    "created_at": "string", // 发送时间。
    "id": 0, // 消息 ID。
    "is_read": false, // 接收者是否已读。
    "recipient_id": 0, // 接收者论坛用户 ID。
    "sender_id": 0 // 发送者论坛用户 ID。
  }], // 当前会话消息，按发送时间正序返回。
  "next_cursor": "string" // 下一页游标；复制到下次请求的 cursor 参数。
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/messages/{userId}?cursor=<cursor>&limit=<limit>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
