# listResourceReviewEventsV2

> GET /api/v1/resources/{id}/review-events · 契约：openapi-public-v1.json

读取有权限访问的 Resource 审核时间线

仅 Resource owner、active member、管理员或版主可读。响应不包含数据库内部数值 ID。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/review-events`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `offset` | 数字 | 否 | 最小 0；最大 100000 |
| `limit` | 数字 | 否 | 最小 1；最大 100 |
| `version_public_id` | 字符串（UUID） | 否 | - |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | 审核事件、字段批注、操作者、时间戳和适用的 parser_version。 |
| `400` | Resource/version public UUID 或分页参数无效。 |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | 当前账号不是该 Resource 成员或审核人员。 |
| `404` | Resource 或指定版本不存在。 |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesIdReviewEventsGetResponse

```json
{
  "data": {
    "items": [{
      "actor": "string",
      "annotation": {
        "body": "string",
        "field_path": "string",
        "severity": "string"
      },
      "event_type": "string",
      "finding_key": "string",
      "parser_version": "string",
      "reason": "string",
      "resource_public_id": "string",
      "result": "string",
      "timestamp": "string",
      "version_public_id": "string"
    }],
    "pagination": {
      "has_more": false,
      "limit": 0,
      "offset": 0
    }
  },
  "meta": {
    "next_cursor": "string",
    "pagination": {},
    "request_id": "string"
  }
}
```

## 调用示例

```bash
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/{id}/review-events?offset=<offset>&limit=<limit>&version_public_id=<version_public_id>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
