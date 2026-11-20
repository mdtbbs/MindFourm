# MultiplayerV1Controller_listSessionJoinRequests

> GET /api/v1/multiplayer/sessions/{id}/join-requests · 契约：openapi-public-v1.json

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`multiplayer.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：1200 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/multiplayer/sessions/{id}/join-requests`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串 | 是 | - |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | 数字 | 否 | 页码，从 1 开始；最小 1 |
| `limit` | 数字 | 否 | 每页加入申请数，最大 50；最小 1；最大 50 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 仅会话房主可读；data 是该会话的待处理加入申请数组（5 分钟有效），分页摘要位于 meta.pagination。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1MultiplayerSessionsIdJoinRequestsGetResponse

```json
{
  "data": [{
    "created_at": "string", // 申请创建时间。
    "expires_at": "string", // 申请有效期截止时间；过期后不可再批准。
    "id": "string", // 传给 approve / reject 的加入请求 ID。
    "user": {
      "avatar_url": "string",
      "id": 0,
      "username": "string"
    }
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
  "$FORUM_BASE_URL/api/v1/multiplayer/sessions/{id}/join-requests?page=<page>&limit=<limit>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
