# NotificationsV1Controller_list

> GET /api/v1/notifications · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`notification.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/notifications`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | 数字 | 否 | 每页通知数，最大 50；最小 1；最大 50 |
| `page` | 数字 | 否 | 结果页码，从 1 开始；最小 1 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 按时间倒序返回通知；分页信息在 data.pagination 和 meta.pagination 中。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1NotificationsGetResponse

```json
{
  "items": [{
    "actor_avatar": "string", // 触发通知用户的头像 URL。
    "actor_id": 0, // 触发通知的用户 ID。
    "actor_name": "string", // 触发通知的用户名。
    "content": "string", // 通知正文。
    "created_at": "string", // 通知时间。
    "id": 0, // 通知 ID。
    "is_read": false, // 是否已读。
    "post_id": 0, // 关联讨论 ID。
    "post_title": "string", // 关联讨论标题。
    "reply_id": 0, // 关联回复 ID。
    "type": "string", // 通知事件类型。
    "user_id": 0 // 接收者论坛用户 ID。
  }], // 当前页通知。
  "pagination": {
    "limit": 0, // 每页条数。
    "page": 0, // 当前页。
    "total": 0, // 通知总数。
    "total_pages": 0 // 总页数。
  }
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/notifications?limit=<limit>&page=<page>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
