# createResourceReviewAnnotationV2

> POST /api/v1/resources/{id}/review-annotations · 契约：openapi-public-v1.json

由管理员或版主添加 Resource 字段批注

可关联一个 Resource version public UUID；批注与审核事件、操作者和 parser_version 一并保存。

## 认证与权限

- 认证：需要 MindAuth access token（`Authorization: Bearer ...`）。
- 必须的权限范围：`resource.upload`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：30 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `POST`

**地址：** `$FORUM_BASE_URL/api/v1/resources/{id}/review-annotations`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | 字符串（UUID） | 是 | Resource public UUID |

### 请求体

内容类型：`application/json`；请求体必填。

```json
{
  "body": "string",
  "field_path": "string",
  "severity": "string",
  "version_public_id": "string" // 可选版本 public UUID；省略表示资源级批注。
}
```

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `201` | Field annotation and review timeline event were saved. |
| `400` | Field path, severity, version UUID, or body is invalid. |
| `401` | 需要有效的 MindAuth access token 或 MDTBBS 登录会话。 |
| `403` | Only an administrator or moderator can add review annotations. |
| `404` | Resource or associated version does not exist. |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** V1ResourcesIdReviewAnnotationsPostResponse

```json
{
  "data": {
    "actor": "string",
    "body": "string",
    "field_path": "string",
    "parser_version": "string",
    "resource_public_id": "string",
    "severity": "string",
    "timestamp": "string",
    "version_public_id": "string"
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
curl --fail-with-body -X POST \
  "$FORUM_BASE_URL/api/v1/resources/{id}/review-annotations" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "body": "string",
  "field_path": "string",
  "severity": "string",
  "version_public_id": "string"
}
JSON
```
