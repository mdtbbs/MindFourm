# MultiplayerV1Controller_acceptInvite

> POST /api/v1/multiplayer/invites/{id}/accept · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`multiplayer.write`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：180 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/multiplayer/invites/{id}/accept`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串 | 是 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 成功响应使用标准 {data, meta} 信封；本 schema 描述 data 中的业务字段。接受邀请后客户端随后调用 POST /api/v1/multiplayer/join-intents/{intent_id}/consume。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1MultiplayerInvitesIdAcceptPostResponse

```json
{
  "invite_id": "string", // 已接受的邀请 ID。
  "join_intent": {
    "expires_in": 0, // 加入意图首次消费前剩余有效秒数。
    "intent_id": "string" // 传给 join-intents/{id}/consume 的一次性加入意图 ID。
  },
  "status": "string" // 邀请状态。
}
```

## 调用示例

```bash
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/multiplayer/invites/{id}/accept" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
