# MessagesV1Controller_send

> POST /api/v1/messages · 契约：openapi-public-v1.json

发送私信

需要有效且未封禁的账号；OAuth Bearer 需要 message.write。尊重收件人私信隐私设置及双方屏蔽关系，每个账号每分钟最多 10 次。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`message.write`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：10 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/messages`

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "content": "string", // 私信正文，最多 5000 个字符。
  "recipient_id": 0.0 // 接收者论坛用户 ID。
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | 消息已发送，并应用收件人隐私、屏蔽与通知策略。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1MessagesPostResponse

```json
{
  "content": "string", // 消息纯文本。
  "content_html": "string", // 服务端生成的安全 HTML。
  "created_at": "string", // 发送时间。
  "id": 0, // 消息 ID。
  "is_read": false, // 接收者是否已读。
  "recipient_id": 0, // 接收者论坛用户 ID。
  "sender_id": 0 // 发送者论坛用户 ID。
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/messages" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "content": "string",
  "recipient_id": 0.0
}
JSON
```
